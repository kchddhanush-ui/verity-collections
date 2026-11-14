import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("fetch coverage is bounded, read-only and scoped to the active connection", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    const user = "00000000-0000-4000-8000-000000000001";
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      insert into auth.users values('${user}');
      select set_config('request.jwt.claim.sub','${user}',false);`);
    for (const name of ["202610280001_case_capture_audit", "202610290002_search_result_capture", "202610300004_case_fetch_modes", "202610300004_case_fetch_modes"])
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const rpc = async (name, args) => (await q(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`, args))[0].result;
    const wa = await rpc("create_workspace", ["Alpha"]);
    const wb = await rpc("create_workspace", ["Beta"]);
    const ca = await rpc("create_capture_connection", [wa, "Chrome Alpha"]);
    const cb = await rpc("create_capture_connection", [wb, "Chrome Beta"]);
    const first = "KAAA010000012025", listed = "KAAA010000022025", foreign = "KAAA010000032025";
    for (const [workspace, cnr] of [[wa, first], [wb, foreign]])
      await q("insert into court_cases(workspace_id,cnr,data,last_checked_at,latest_capture_at) values($1,$2,'{}',now(),now())", [workspace, cnr]);
    // A search row with parties/number is not a captured case detail record.
    const searchId = crypto.randomUUID();
    await q("insert into court_search_captures(id,workspace_id,connection_id,captured_by,captured_at,source_url,search_context,court_totals,loaded_rows,skipped_rows,snapshot,parser_version) values($1,$2,$3,$4,now(),'https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index','{}','[]',1,0,'{}','1.0.0')", [searchId, wa, ca.id, user]);
    await q("insert into case_listings(workspace_id,cnr,data,observed_at,search_capture_id) values($1,$2,'{}',now(),$3)", [wa, listed, searchId]);
    const check = async (token, cnrs) => {
      await db.exec("reset role; set role anon");
      return await rpc("get_case_capture_coverage", [token, cnrs]);
    };
    await t.test("detail coverage separates search-only rows and other-workspace records", async () => {
      assert.deepEqual(await check(ca.token, [listed, first, foreign, first]), [
        { cnr: listed, has_details: false }, { cnr: first, has_details: true }, { cnr: foreign, has_details: false },
      ]);
      assert.deepEqual(await check(cb.token, [first, foreign]), [
        { cnr: first, has_details: false }, { cnr: foreign, has_details: true },
      ]);
      assert.deepEqual(await check(ca.token, []), []);
      await assert.rejects(q("select * from court_cases"), /permission denied/);
    });
    await t.test("invalid lists and tokens are rejected", async () => {
      for (const cnrs of [null, {}, [null], [1], [first.toLowerCase()], ["invalid"], Array(2001).fill(first)])
        await assert.rejects(check(ca.token, cnrs), /Invalid case|Too many/);
      for (const token of [null, "bad", "0".repeat(64)])
        await assert.rejects(check(token, [first]), /invalid or expired/);
    });
    await t.test("lookup does not create captures, update cases or append audits", async () => {
      await db.exec("reset role");
      const before = await q("select jsonb_agg(c) as records from court_cases c");
      await check(ca.token, [first, listed]);
      await db.exec("reset role");
      assert.deepEqual(await q("select jsonb_agg(c) as records from court_cases c"), before);
      assert.equal((await q("select count(*)::int as n from case_captures"))[0].n, 0);
      assert.equal((await q("select count(*)::int as n from case_audit"))[0].n, 0);
    });
    await t.test("revoked, expired and removed-member connections cannot check coverage", async () => {
      await q("update capture_connections set revoked_at=now() where id=$1", [ca.id]);
      await assert.rejects(check(ca.token, [first]), /invalid or expired/);
      await db.exec("reset role");
      await q("update capture_connections set revoked_at=null,expires_at=now()-interval '1 second' where id=$1", [ca.id]);
      await assert.rejects(check(ca.token, [first]), /invalid or expired/);
      await db.exec("reset role");
      await q("update capture_connections set expires_at=now()+interval '1 day' where id=$1", [ca.id]);
      await q("delete from workspace_members where workspace_id=$1", [wa]);
      await assert.rejects(check(ca.token, [first]), /invalid or expired/);
    });
  } finally {
    await db.close();
  }
});
