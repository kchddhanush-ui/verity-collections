import { test } from "node:test";
import assert from "node:assert/strict";

// Exercise the real service worker with browser APIs and HTTP responses isolated.
test("extension connection, automatic save, queue, pause and sender checks", async () => {
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
    outdated = false;
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
        request: async (_name, ...args) => args.at(-1)({ name: _name }),
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
      sendMessage: async (_id, message) =>
        message.type === "PROBE_CASE"
          ? { available: true, hasLink: true }
          : loadResponse,
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
    // Automatic list capture queues unique CNRs and advances only on confirmed saves.
    const batchList = {
      ...list,
      entries: [{ cnr: payload.cnr }, { cnr: payload.cnr }],
    };
    await send({
      type: "CAPTURE",
      capture: batchList,
      searchSession: "page-a",
    });
    assert.equal(values.batch.cnrs.length, 1);
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
    await send({ type: "BATCH_PAUSE" }, popup);
    values.batch.nextAt = 0;
    await send({ type: "BATCH_TICK" });
    assert.equal(values.batch.index, 0, "paused queue cannot advance");
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
