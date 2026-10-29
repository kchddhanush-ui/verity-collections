import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile } from "node:fs/promises";
import { mergePortfolio } from "../src/lib/portfolio.js";
import "../extension/parser.js";

function searchPage() {
  return parseHTML(
    `<html><body><div id="res_party"><h3 id="courtSummary">Total Number of Establishments in Court Complex : 1 | Total number of cases : 563</h3><a href="#td_court_name_2">EXAMPLE COURT: 563</a><table id="dispTable"><tbody><tr><th id="td_court_name_2">EXAMPLE COURT</th></tr><tr><td>1</td><td>C.C./1/2025</td><td>Example Finance<br>Vs<br>Example Respondent</td><td><a onclick="viewHistory(1,'KAAA010000012025',2,'','',3,20,1030134,'')" href="#?app_token=not-saved">View</a></td></tr><tr><td>2</td><td>C.C./2/2025</td><td>Example Finance<br>Vs<br>Other Respondent</td><td><a onclick="viewHistory(2,'KAAA010000022025',2)" href="#">View</a></td></tr></tbody></table></div></body></html>`,
  ).document;
}
test("search parser captures row identities, parties and scoped court totals", () => {
  const doc = searchPage(),
    result = VerityParser.extractSearch(doc, () => true);
  assert.equal(result.entries.length, 2);
  assert.equal(result.reported_cases, 563);
  assert.equal(result.loaded_rows, 2);
  assert.equal(result.total_establishments, 1);
  assert.equal(result.court_totals[0].reported_cases, 563);
  assert.equal(result.entries[0].data.registration_number, "1/2025");
  assert.deepEqual(result.entries[0].data.respondents, ["Example Respondent"]);
  assert.equal(result.entries[0].data.case_status, undefined);
  assert.ok(!JSON.stringify(result).includes("app_token"));
  assert.equal(
    VerityParser.extractSearch(doc),
    null,
    "hidden search table not captured",
  );
  doc.querySelector("a[onclick]").removeAttribute("onclick");
  const skipped = VerityParser.extractSearch(doc, () => true);
  assert.equal(skipped.skipped_rows, 1);
  assert.equal(skipped.entries.length, 1);
});
test("listing and details join by CNR without downgrading known status", () => {
  const listing = {
    id: "list-a",
    cnr: "KAAA010000012025",
    data: {
      registration_number: "1/2025",
      case_reference: "C.C./1/2025",
      petitioners: ["Listing party"],
    },
    last_seen_at: "2026-10-29T00:00:00Z",
  };
  const detail = {
    id: "detail-a",
    cnr: listing.cnr,
    data: {
      case_stage: "NBW",
      case_status: "Pending",
      petitioners: ["Detailed party / advocate"],
    },
    last_checked_at: "2026-10-28T00:00:00Z",
  };
  const merged = mergePortfolio([detail], [listing]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "detail-a");
  assert.equal(merged[0].data.case_stage, "NBW");
  assert.deepEqual(merged[0].data.petitioners, ["Detailed party / advocate"]);
  assert.equal(merged[0].data.case_reference, "C.C./1/2025");
  assert.equal(merged[0].hasDetails, true);
  assert.equal(mergePortfolio([], [listing])[0].hasDetails, false);
});
test("search ingestion is audited, idempotent, tenant-scoped and does not overwrite case details", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const uid = "00000000-0000-4000-8000-000000000001",
    other = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${uid}'),('${other}');`,
    );
    for (const migration of [
      "202610280001_case_capture_audit.sql",
      "202610290002_search_result_capture.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + migration, import.meta.url),
          "utf8",
        ),
      );
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const rpc = async (name, args) =>
      (
        await q(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as v`,
          args,
        )
      )[0].v;
    async function asUser(id) {
      await db.exec("reset role");
      await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec("set role authenticated");
    }
    await asUser(uid);
    const w = await rpc("create_workspace", ["Alpha"]);
    const conn = await rpc("create_capture_connection", [w, "Chrome"]);
    const capture = () => ({
      ...VerityParser.extractSearch(searchPage(), () => true),
      id: crypto.randomUUID(),
      captured_at: new Date().toISOString(),
    });
    async function ingest(cap) {
      await db.exec("reset role;set role anon");
      return rpc("ingest_search_capture", [conn.token, cap]);
    }
    const first = capture();
    assert.equal((await ingest(first)).saved_rows, 2);
    assert.equal((await ingest(first)).duplicate, true);
    await asUser(uid);
    assert.equal((await q("select * from case_listings")).length, 2);
    assert.equal((await q("select * from listing_audit")).length, 2);
    assert.equal((await q("select * from court_cases")).length, 0);
    await ingest(capture());
    await asUser(uid);
    assert.equal((await q("select * from court_search_captures")).length, 2);
    assert.equal((await q("select * from listing_audit")).length, 2);
    // Opened detail is stored in existing audited detail pipeline.
    await db.exec("reset role;set role anon");
    await rpc("ingest_case_capture", [
      conn.token,
      {
        id: crypto.randomUUID(),
        captured_at: new Date().toISOString(),
        cnr: first.entries[0].cnr,
        source_url: first.source_url,
        parser_version: "1.0.0",
        data: {
          registration_number: "1/2025",
          court: "EXAMPLE COURT",
          case_stage: "NBW",
          case_status: "Pending",
        },
      },
    ]);
    const changed = capture();
    changed.entries[0].data.respondents = ["Changed listed party"];
    await ingest(changed);
    await asUser(uid);
    assert.equal(
      (await q("select * from court_cases"))[0].data.case_stage,
      "NBW",
    );
    assert.equal((await q("select * from listing_audit")).length, 3);
    // A stale list is retained as a snapshot, without changing current listing data.
    const stale = capture();
    stale.captured_at = new Date(Date.now() - 3600000).toISOString();
    await ingest(stale);
    await asUser(uid);
    assert.deepEqual(
      (
        await q("select data from case_listings where cnr=$1", [
          first.entries[0].cnr,
        ])
      )[0].data.respondents,
      ["Changed listed party"],
    );
    await asUser(other);
    assert.equal((await q("select * from case_listings")).length, 0);
    assert.equal((await q("select * from court_search_captures")).length, 0);
    assert.equal((await q("select * from listing_audit")).length, 0);
    await assert.rejects(q("delete from listing_audit"), /permission denied/);
    // Audit failure rolls back all rows and the page snapshot.
    await db.exec(
      "reset role;create function fail_listing_audit() returns trigger language plpgsql as $$begin raise exception 'audit failure';end$$;create trigger fail_listing before insert on listing_audit for each row execute function fail_listing_audit();",
    );
    const fail = capture();
    fail.entries[0].data.respondents = ["Should roll back"];
    await assert.rejects(ingest(fail), /audit failure/);
    await asUser(uid);
    assert.equal(
      (await q("select * from court_search_captures where id=$1", [fail.id]))
        .length,
      0,
    );
    assert.deepEqual(
      (
        await q("select data from case_listings where cnr=$1", [
          first.entries[0].cnr,
        ])
      )[0].data.respondents,
      ["Changed listed party"],
    );
    await db.exec("reset role;drop trigger fail_listing on listing_audit");
    const bad = capture();
    bad.entries[0].cnr = "bad";
    await assert.rejects(ingest(bad), /listing CNR/);
    const bulk = capture();
    bulk.entries = Array.from({ length: 563 }, (_, i) => ({
      cnr: "KBBB" + String(i + 1).padStart(12, "0"),
      data: {
        ...first.entries[0].data,
        serial_number: String(i + 1),
        case_reference: `C.C./${i + 1}/2025`,
        registration_number: `${i + 1}/2025`,
      },
    }));
    bulk.loaded_rows = 563;
    bulk.reported_cases = 563;
    assert.equal((await ingest(bulk)).saved_rows, 563);
    await asUser(uid);
    assert.equal((await q("select * from case_listings")).length, 565);
    await asUser(uid);
    await rpc("revoke_capture_connection", [conn.id]);
    await assert.rejects(ingest(capture()), /invalid or expired/);
  } finally {
    await db.close();
  }
});
