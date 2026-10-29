import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
test("PostgreSQL capture, audit, revocation and tenant isolation", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values('${alice}'),('${bob}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610280001_case_capture_audit.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const decisionMigration = await readFile(
      new URL(
        "../supabase/migrations/202610290003_decision_date_capture.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(decisionMigration);
    await db.exec(decisionMigration); // The upgrade is safe to rerun.
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const rpc = async (name, args) => {
      const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
      return (
        await q(`select public.${name}(${placeholders}) as value`, args)
      )[0].value;
    };
    async function asUser(id) {
      await db.exec("reset role");
      await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec("set role authenticated");
    }
    await asUser(alice);
    const wa = await rpc("create_workspace", ["Alpha"]);
    const ca = await rpc("create_capture_connection", [wa, "Chrome"]);
    await asUser(bob);
    const wb = await rpc("create_workspace", ["Beta"]);
    const cb = await rpc("create_capture_connection", [wb, "Chrome"]);
    let offset = -60000;
    const capture = (changes = {}) => ({
      id: crypto.randomUUID(),
      captured_at: new Date(Date.now() + (offset += 1000)).toISOString(),
      cnr: "KAAA010000012025",
      parser_version: "1.0.0",
      source_url:
        "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
      data: {
        registration_number: "1/2025",
        court: "Example Court",
        case_stage: "SUMMONS",
        case_status: "Pending",
        next_hearing_date: "1 January 2027",
        ...changes,
      },
    });
    const ingest = async (token, data) => {
      await db.exec("reset role; set role anon");
      return rpc("ingest_case_capture", [token, data]);
    };
    const first = capture();
    let result = await ingest(ca.token, first);
    const caseId = result.case_id;
    await t.test("creation and idempotent retry", async () => {
      assert.equal(result.status, "created");
      assert.equal((await ingest(ca.token, first)).duplicate, true);
    });
    await t.test("unchanged check creates no extra change audit", async () => {
      assert.equal((await ingest(ca.token, capture())).status, "unchanged");
      await asUser(alice);
      assert.equal((await q("select * from case_audit")).length, 1);
      assert.equal((await q("select * from case_captures")).length, 2);
    });
    await t.test("update preserves old and new values", async () => {
      assert.equal(
        (await ingest(ca.token, capture({ case_stage: "NBW" }))).status,
        "updated",
      );
      await asUser(alice);
      const a = await q(
        "select changes from case_audit where action='updated'",
      );
      assert.deepEqual(a[0].changes.case_stage, { old: "SUMMONS", new: "NBW" });
    });
    await t.test("blank values do not erase current details", async () => {
      const cap = capture({
        case_stage: "",
        next_hearing_date: "",
        court: "Example Court",
        case_status: "Pending",
      });
      await ingest(ca.token, cap);
      await asUser(alice);
      assert.equal(
        (await q("select data from court_cases"))[0].data.case_stage,
        "NBW",
      );
    });
    await t.test("older capture cannot overwrite newer data", async () => {
      const old = capture({ case_stage: "OLD" });
      old.captured_at = new Date(Date.now() - 3600000).toISOString();
      assert.equal((await ingest(ca.token, old)).status, "stale");
      await asUser(alice);
      assert.equal(
        (await q("select data from court_cases"))[0].data.case_stage,
        "NBW",
      );
    });
    await t.test("same CNR stays separate between customers", async () => {
      const b = await ingest(cb.token, capture());
      assert.notEqual(b.case_id, caseId);
      await asUser(bob);
      assert.equal((await q("select * from court_cases")).length, 1);
      assert.equal((await q("select * from case_audit"))[0].workspace_id, wb);
      assert.equal((await q("select * from case_captures")).length, 1);
      assert.equal(
        (await q("select * from court_cases where workspace_id=$1", [wa]))
          .length,
        0,
      );
    });
    await t.test(
      "direct table writes and foreign workspace connections denied",
      async () => {
        await assert.rejects(
          q("update court_cases set data='{}'"),
          /permission denied/,
        );
        await assert.rejects(q("delete from case_audit"), /permission denied/);
        await assert.rejects(
          rpc("create_capture_connection", [wa, "bad"]),
          /access denied/,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          q("select * from court_cases"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "audit insert failure rolls back case and capture",
      async () => {
        await db.exec(
          "reset role; create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end$$; create trigger test_fail before insert on public.case_audit for each row execute function public.fail_audit();",
        );
        const cap = capture({ case_stage: "CHANGED" });
        await assert.rejects(ingest(ca.token, cap), /audit unavailable/);
        await asUser(alice);
        assert.equal(
          (await q("select data from court_cases"))[0].data.case_stage,
          "NBW",
        );
        assert.equal(
          (await q("select * from case_captures where id=$1", [cap.id])).length,
          0,
        );
        await db.exec("reset role;drop trigger test_fail on case_audit;");
      },
    );
    await t.test(
      "disposed case clears stale next hearing and audits removal",
      async () => {
        const cap = capture({
          case_status: "Disposed",
          case_stage: "Disposed",
        });
        delete cap.data.next_hearing_date;
        await ingest(ca.token, cap);
        await asUser(alice);
        assert.equal(
          (await q("select data from court_cases"))[0].data.next_hearing_date,
          undefined,
        );
      },
    );
    await t.test(
      "decision date is stored independently, corrected with audit, and protected from blank/stale captures",
      async () => {
        const cnr = "KAAA010000992025";
        const decisionCapture = (value, disposal = "08-10-2026") => {
          const cap = capture({
            case_status: "Disposed",
            case_stage: "Disposed",
            decision_date: value,
            disposal_date: disposal,
          });
          cap.cnr = cnr;
          cap.parser_version = "1.1.0";
          delete cap.data.next_hearing_date;
          return cap;
        };
        const first = decisionCapture("07-10-2026");
        const created = await ingest(ca.token, first);
        assert.equal(created.status, "created");
        await asUser(alice);
        const stored = (
          await q("select data from court_cases where id=$1", [created.case_id])
        )[0].data;
        assert.equal(stored.decision_date, "07-10-2026");
        assert.equal(stored.disposal_date, "08-10-2026");
        const snapshot = (
          await q(
            "select snapshot,parser_version from case_captures where id=$1",
            [first.id],
          )
        )[0];
        assert.equal(snapshot.snapshot.decision_date, "07-10-2026");
        assert.equal(snapshot.parser_version, "1.1.0");
        const corrected = decisionCapture("06-10-2026");
        assert.equal((await ingest(ca.token, corrected)).status, "updated");
        await asUser(alice);
        const audit = (
          await q("select changes from case_audit where capture_id=$1", [
            corrected.id,
          ])
        )[0].changes;
        assert.deepEqual(audit.decision_date, {
          old: "07-10-2026",
          new: "06-10-2026",
        });
        assert.equal(audit.disposal_date, undefined);
        assert.equal((await ingest(ca.token, corrected)).duplicate, true);
        for (const value of ["", "-", null, undefined])
          assert.equal(
            (await ingest(ca.token, decisionCapture(value))).status,
            "unchanged",
          );
        const stale = decisionCapture("01-10-2026");
        stale.captured_at = new Date(Date.now() - 3600000).toISOString();
        assert.equal((await ingest(ca.token, stale)).status, "stale");
        await asUser(alice);
        assert.equal(
          (
            await q("select data from court_cases where id=$1", [
              created.case_id,
            ])
          )[0].data.decision_date,
          "06-10-2026",
        );
        assert.equal(
          (
            await q("select * from case_audit where case_id=$1", [
              created.case_id,
            ])
          ).length,
          2,
        );
        await asUser(bob);
        assert.equal(
          (await q("select * from court_cases where id=$1", [created.case_id]))
            .length,
          0,
        );
        // Decision date and snapshot must roll back with an unavailable audit.
        await db.exec(
          "reset role; create trigger decision_fail before insert on public.case_audit for each row execute function public.fail_audit();",
        );
        const failed = decisionCapture("05-10-2026");
        await assert.rejects(ingest(ca.token, failed), /audit unavailable/);
        await db.exec(
          "reset role; drop trigger decision_fail on public.case_audit;",
        );
        await asUser(alice);
        assert.equal(
          (
            await q("select data from court_cases where id=$1", [
              created.case_id,
            ])
          )[0].data.decision_date,
          "06-10-2026",
        );
        assert.equal(
          (await q("select * from case_captures where id=$1", [failed.id]))
            .length,
          0,
        );
        const bad = decisionCapture("05-10-2026");
        bad.parser_version = "99.0.0";
        await assert.rejects(
          ingest(ca.token, bad),
          /Unsupported parser version/,
        );
      },
    );
    await t.test("session URL and incomplete pages rejected", async () => {
      const bad = capture();
      bad.source_url += "&app_token=secret";
      await assert.rejects(ingest(ca.token, bad), /Unsupported source/);
      const partial = capture();
      delete partial.data.registration_number;
      await assert.rejects(ingest(ca.token, partial), /Incomplete/);
    });
    await t.test("revocation and removed membership stop uploads", async () => {
      await asUser(alice);
      await rpc("revoke_capture_connection", [ca.id]);
      await assert.rejects(ingest(ca.token, capture()), /invalid or expired/);
      await db.exec("reset role");
      await q("delete from workspace_members where workspace_id=$1", [wb]);
      await assert.rejects(ingest(cb.token, capture()), /invalid or expired/);
    });
  } finally {
    await db.close();
  }
});
