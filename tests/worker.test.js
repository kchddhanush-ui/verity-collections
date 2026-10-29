import { test } from "node:test";
import assert from "node:assert/strict";

// Exercise the real service worker with browser APIs and HTTP responses isolated.
test("extension connection, automatic save, queue, pause and sender checks", async (t) => {
  const values = {},
    listeners = {},
    alarms = [],
    badges = [];
  let offline = false,
    revoked = false,
    courtTabs = [],
    loadResponse = null,
    uploads = 0,
    lastUpload = null,
    outdated = false,
    coverageMissing = false,
    badCoverage = false,
    navigationBusy = false,
    coverageHook = null;
  const storedCnrs = new Set(), loads = [];
  const originalChrome = globalThis.chrome,
    originalFetch = globalThis.fetch;
  const savedNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async (_name, ...args) => args.at(-1)(
          _name === "verity-case-navigation" && navigationBusy ? null : { name: _name },
        ),
      },
    },
  });
  globalThis.chrome = {
    runtime: {
      id: "verity",
      getURL: (path) => `chrome-extension://verity/${path}`,
      onMessage: {
        addListener: (fn) => {
          listeners.message = fn;
        },
      },
      onInstalled: { addListener: () => {} },
    },
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async (key) =>
          key === null
            ? structuredClone(values)
            : Array.isArray(key)
              ? Object.fromEntries(
                  key.map((k) => [k, structuredClone(values[k])]),
                )
              : { [key]: structuredClone(values[key]) },
        set: async (data) => {
          Object.assign(values, structuredClone(data));
        },
        remove: async (keys) => {
          for (const k of [].concat(keys)) delete values[k];
        },
      },
    },
    action: {
      setBadgeText: async (x) => {
        badges.push(x.text);
      },
    },
    tabs: {
      query: async () => courtTabs,
      update: async () => {},
      create: async () => {},
      sendMessage: async (_id, message) => {
        if (message.type === "PROBE_CASE") return { available: true, hasLink: true };
        if (message.type === "LOAD_CASE") loads.push(message);
        return loadResponse;
      },
    },
    alarms: {
      create: async (...args) => {
        alarms.push(args);
      },
      onAlarm: {
        addListener: (fn) => {
          listeners.alarm = fn;
        },
      },
    },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.apikey, "sb_publishable_test");
    assert.equal(options.credentials, "omit");
    if (offline) throw new TypeError("Network unavailable");
    if (revoked)
      return new Response(
        JSON.stringify({ message: "Connection invalid or expired" }),
        { status: 400 },
      );
    if (url.endsWith("/get_case_capture_coverage")) {
      if (coverageMissing) return Response.json({ code: "PGRST202" }, { status: 404 });
      const { p_token, p_cnrs } = JSON.parse(options.body);
      assert.equal(p_token, "a".repeat(64));
      assert.ok(!options.headers.Authorization, "coverage uses only the scoped connection");
      if (coverageHook) await coverageHook();
      return Response.json(badCoverage ? [] : p_cnrs.map(cnr => ({ cnr, has_details: storedCnrs.has(cnr) })));
    }
    if (url.endsWith("/check_capture_connection"))
      return Response.json({
        id: "connection-a",
        workspace: "Alpha",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
    if (url.endsWith("/ingest_search_capture"))
      return Response.json({
        status: "search_saved",
        saved_rows: 2,
        skipped_rows: 0,
      });
    if (url.endsWith("/list_capture_connections"))
      return Response.json(
        options.headers.Authorization === "Bearer dashboard-token" &&
          JSON.parse(options.body).p_workspace ===
            "00000000-0000-4000-8000-000000000010"
          ? [
              {
                id: "connection-a",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                revoked_at: null,
              },
            ]
          : [],
      );
    if (outdated)
      return Response.json(
        { message: "Unsupported parser version" },
        { status: 400 },
      );
    uploads++;
    lastUpload = JSON.parse(options.body).p_capture;
    storedCnrs.add(lastUpload.cnr);
    return Response.json({ status: "created", case_id: "case-a" });
  };
  try {
    await import("../extension/worker.js");
    const popup = { id: "verity", url: "chrome-extension://verity/popup.html" };
    const page = {
      id: "verity",
      url: "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
      tab: { id: 1 },
    };
    const send = (message, sender = page) =>
      new Promise((resolve) => listeners.message(message, sender, resolve));
    const config = {
      url: "https://example.supabase.co",
      key: "sb_publishable_test",
      token: "a".repeat(64),
    };
    assert.ok(
      (await send({ type: "CONFIGURE", config })).error,
      "content scripts cannot configure connection",
    );
    assert.ok(
      (
        await send(
          {
            type: "CONFIGURE",
            config: { ...config, key: "sb_secret_forbidden" },
          },
          popup,
        )
      ).error,
    );
    assert.equal((await send({ type: "CONFIGURE", config }, popup)).ok, true);
    assert.equal(values.config.workspace, "Alpha");
    assert.equal(values.config.fetchMode, "missing");
    const capture = () => ({
      id: crypto.randomUUID(),
      cnr: "KAAA010000012025",
      captured_at: new Date().toISOString(),
      source_url:
        "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
      parser_version: "1.0.0",
      data: {
        court: "Court",
        registration_number: "1/2025",
        case_stage: "NBW",
      },
    });
    assert.equal(
      (await send({ type: "CAPTURE", capture: capture() })).message,
      "Case saved",
    );
    assert.equal(
      Object.keys(values).filter((k) => k.startsWith("pending:")).length,
      0,
    );
    const dated = capture();
    dated.parser_version = "1.1.0";
    dated.data.decision_date = "07-10-2026";
    assert.equal((await send({ type: "CAPTURE", capture: dated })).saved, true);
    assert.equal(lastUpload.data.decision_date, "07-10-2026");
    assert.equal(lastUpload.parser_version, "1.1.0");
    outdated = true;
    assert.match(
      (
        await send({
          type: "CAPTURE",
          capture: { ...dated, id: crypto.randomUUID() },
        })
      ).message,
      /202610290003_decision_date_capture.sql/,
    );
    outdated = false;
    const list = { ...capture(), kind: "search_list", entries: [{}, {}] };
    delete list.cnr;
    assert.equal(
      (await send({ type: "CAPTURE", capture: list })).message,
      "Search saved · 2 cases listed",
    );
    const app = { id: "verity", url: "http://127.0.0.1:5173/", tab: { id: 4 } };
    const payload = {
      cnr: "KAAA010000012025",
      workspace: "00000000-0000-4000-8000-000000000010",
      projectUrl: config.url,
      accessToken: "dashboard-token",
    };
    assert.equal(
      (await send({ type: "DASHBOARD", action: "PING" }, app)).connected,
      true,
    );
    assert.ok(
      (
        await send(
          { type: "DASHBOARD", action: "PING" },
          { ...app, url: "https://evil.example/" },
        )
      ).error,
    );
    assert.ok(
      (
        await send(
          {
            type: "DASHBOARD",
            action: "FETCH_CASE",
            payload: {
              ...payload,
              workspace: "00000000-0000-4000-8000-000000000099",
            },
          },
          app,
        )
      ).error,
    );
    assert.ok(
      (
        await send(
          {
            type: "DASHBOARD",
            action: "FETCH_CASE",
            payload: { ...payload, accessToken: "wrong-user" },
          },
          app,
        )
      ).error,
    );
    assert.equal(
      (await send({ type: "DASHBOARD", action: "FETCH_CASE", payload }, app))
        .actionNeeded,
      true,
      "missing court tab requires user action",
    );
    courtTabs = [{ id: 9 }];
    loadResponse = { capture: capture() };
    const fetched = await send(
      { type: "DASHBOARD", action: "FETCH_CASE", payload },
      app,
    );
    assert.equal(fetched.saved, true);
    assert.ok(
      !JSON.stringify(values).includes("dashboard-token"),
      "dashboard login token is not persisted",
    );
    const before = uploads;
    loadResponse = { capture: { ...capture(), cnr: "KAAA010000992025" } };
    assert.equal(
      (await send({ type: "DASHBOARD", action: "FETCH_CASE", payload }, app))
        .actionNeeded,
      true,
    );
    assert.equal(uploads, before, "identity mismatch never uploads");
    loadResponse = { error: "CAPTCHA required" };
    assert.equal(
      (await send({ type: "DASHBOARD", action: "FETCH_CASE", payload }, app))
        .actionNeeded,
      true,
    );
    // Automatic list capture queues only missing details, then confirms each save.
    storedCnrs.delete(payload.cnr);
    const batchList = {
      ...list,
      entries: [{ cnr: payload.cnr }, { cnr: payload.cnr }],
    };
    await send({
      type: "CAPTURE",
      capture: batchList,
      searchSession: "page-a",
    });
    assert.equal(values.batch.cnrs.length, 1, values.batch.message);
    values.batch.nextAt = 0;
    loadResponse = { error: "CAPTCHA required" };
    await send({ type: "BATCH_TICK" });
    assert.equal(values.batch.state, "attention");
    assert.equal(values.batch.index, 0);
    assert.equal(values.batch.failed.length, 1);
    await send({ type: "BATCH_RESUME" }, popup);
    loadResponse = { capture: capture() };
    await send({ type: "BATCH_TICK" });
    assert.equal(values.batch.state, "complete");
    assert.equal(values.batch.index, 1);
    assert.equal(values.batch.failed.length, 0);
    const completedId = values.batch.id;
    await send({
      type: "CAPTURE",
      capture: batchList,
      searchSession: "page-a",
    });
    assert.equal(
      values.batch.id,
      completedId,
      "retained result table cannot loop",
    );
    await send({
      type: "CAPTURE",
      capture: batchList,
      searchSession: "page-b",
    });
    assert.equal(values.batch.cnrs.length, 0, "new searches default to missing and skip saved cases");
    assert.equal(values.batch.state, "complete");
    await send({ type: "BATCH_START", mode: "existing" }, popup);
    assert.equal(values.batch.cnrs.length, 1);
    await send({ type: "BATCH_PAUSE" }, popup);
    values.batch.nextAt = 0;
    await send({ type: "BATCH_TICK" });
    assert.equal(values.batch.index, 0, "paused queue cannot advance");
    await t.test("separate missing and existing queues use full server coverage and preserve explicit refresh", async () => {
      const other = "KAAA010000022025";
      const modesList = { ...list, entries: [{ cnr: other }, { cnr: payload.cnr }, { cnr: other }] };
      await send({ type: "CAPTURE", capture: modesList, searchSession: "modes" });
      assert.equal(values.batch.mode, "existing", "last selected mode persists for new searches");
      assert.deepEqual(values.batch.cnrs, [payload.cnr]);
      let result = await send({ type: "DASHBOARD", action: "BATCH_START", payload: { ...payload, mode: "missing" } }, app);
      assert.equal(result.batch.mode, "missing");
      assert.deepEqual(values.batch.cnrs, [other], "a listed-only record still needs its details");
      values.batch.nextAt = 0;
      loadResponse = { capture: { ...capture(), cnr: other } };
      await send({ type: "BATCH_TICK" });
      assert.equal(values.batch.saved, 1);
      assert.equal(loads.at(-1).cnr, other);
      result = await send({ type: "DASHBOARD", action: "BATCH_START", payload: { ...payload, mode: "existing" } }, app);
      assert.deepEqual(values.batch.cnrs, [other, payload.cnr], "refresh reclassifies the original loaded search");
      values.batch.nextAt = 0;
      const oldUploads = uploads;
      await send({ type: "BATCH_TICK" });
      assert.equal(uploads, oldUploads + 1, "existing details are fetched and uploaded again");
      assert.equal(loads.at(-1).force, true);
      assert.equal(result.batch.total, 2);
      assert.ok((await send({ type: "BATCH_START", mode: "all" }, popup)).error);
      const id = values.batch.id;
      assert.ok((await send({ type: "BATCH_START", mode: "missing" }, page)).error, "court content cannot change mode");
      assert.ok((await send({ type: "DASHBOARD", action: "BATCH_START", payload: { ...payload, mode: "missing", accessToken: "wrong-user" } }, app)).error);
      assert.equal(values.batch.id, id);
      navigationBusy = true;
      assert.match((await send({ type: "BATCH_START", mode: "missing" }, popup)).error, /case is loading/);
      navigationBusy = false;
    });
    await t.test("missing targets saved by another capture are skipped without reopening or fake saved counts", async () => {
      storedCnrs.clear();
      await send({ type: "BATCH_START", mode: "missing" }, popup);
      const cnr = values.batch.cnrs[0];
      storedCnrs.add(cnr);
      const count = loads.length;
      values.batch.nextAt = 0;
      const result = await send({ type: "BATCH_TICK" });
      assert.equal(loads.length, count);
      assert.equal(result.batch.saved, 0);
      assert.equal(result.batch.skipped, 1);
      assert.equal(result.batch.processed, 1);
    });
    await t.test("failed coverage checks retain the saved search and require a successful check before fetching", async () => {
      const count = loads.length;
      coverageMissing = true;
      const result = await send({ type: "CAPTURE", capture: { ...list, id: crypto.randomUUID(), entries: [{ cnr: payload.cnr }] }, searchSession: "needs-sql" });
      assert.equal(result.saved, true, "search upload remains successful even if detail classification fails");
      assert.equal(values.batch.state, "attention");
      assert.match(values.batch.message, /202610300004_case_fetch_modes.sql/);
      assert.equal(values.batch.cnrs.length, 0);
      coverageMissing = false;
      badCoverage = true;
      await send({ type: "BATCH_RESUME" }, popup);
      assert.equal(values.batch.state, "attention");
      assert.equal(loads.length, count, "an incomplete server response never falls back to fetching all cases");
      badCoverage = false;
      storedCnrs.clear();
      await send({ type: "BATCH_RESUME" }, popup);
      assert.equal(values.batch.state, "waiting");
      assert.deepEqual(values.batch.cnrs, [payload.cnr]);
      coverageHook = async () => { await send({ type: "BATCH_PAUSE" }, popup); };
      values.batch.nextAt = 0;
      await send({ type: "BATCH_TICK" });
      coverageHook = null;
      assert.equal(values.batch.state, "paused");
      assert.equal(loads.length, count, "pausing during a coverage check must not start source navigation");
    });
    await t.test("legacy queues are reclassified instead of fetching every old target", async () => {
      delete values.batch.mode;
      delete values.batch.sourceCnrs;
      delete values.batch.saved;
      values.batch.state = "waiting";
      values.batch.nextAt = 0;
      storedCnrs.add(payload.cnr);
      const count = loads.length;
      await send({ type: "BATCH_TICK" });
      assert.equal(values.batch.mode, "missing");
      assert.equal(values.batch.state, "complete");
      assert.equal(values.batch.cnrs.length, 0);
      assert.equal(loads.length, count);
    });
    courtTabs = [];
    offline = true;
    const cap = capture();
    assert.equal(
      (await send({ type: "CAPTURE", capture: cap })).message,
      "Sync pending · automatic retry",
    );
    assert.equal(values[`pending:${cap.id}`].attempts, 1);
    assert.ok(alarms.some(([name]) => name === "retry"));
    await send({ type: "TOGGLE" }, popup);
    assert.equal(
      (await send({ type: "CAPTURE", capture: capture() })).accepted,
      false,
    );
    await send({ type: "TOGGLE" }, popup);
    offline = false;
    // Reconnect intentionally discards queued captures tied to the old connection.
    await send({ type: "CONFIGURE", config }, popup);
    assert.equal(
      Object.keys(values).filter((k) => k.startsWith("pending:")).length,
      0,
    );
    revoked = true;
    assert.equal(
      (await send({ type: "CAPTURE", capture: capture() })).accepted,
      false,
    );
    assert.equal(values.config.enabled, false);
    assert.equal(
      (
        await send(
          { type: "CAPTURE", capture: capture() },
          { id: "other", url: "https://evil.example", tab: { id: 2 } },
        )
      ).error,
      "Unsupported request",
    );
    await send({ type: "DISCONNECT" }, popup);
    assert.equal(values.config, undefined);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    if (savedNavigator)
      Object.defineProperty(globalThis, "navigator", savedNavigator);
    else delete globalThis.navigator;
  }
});
