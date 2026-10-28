import { test } from "node:test";
import assert from "node:assert/strict";

// Exercise the real service worker with browser APIs and HTTP responses isolated.
test("extension connection, automatic save, queue, pause and sender checks", async () => {
  const values = {},
    listeners = {},
    alarms = [],
    badges = [];
  let offline = false,
    revoked = false;
  const originalChrome = globalThis.chrome,
    originalFetch = globalThis.fetch;
  const savedNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: { request: async (_name, fn) => fn() } },
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
    tabs: { query: async () => [], sendMessage: async () => {} },
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
    offline = true;
    const cap = capture();
    assert.equal(
      (await send({ type: "CAPTURE", capture: cap })).message,
      "Sync pending · automatic retry",
    );
    assert.equal(values[`pending:${cap.id}`].attempts, 1);
    assert.equal(alarms.length, 1);
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
