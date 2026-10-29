import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

test("popup switches fetch modes and presents empty queues without a misleading progress bar", async () => {
  const { document, window } = parseHTML(await readFile(new URL("../extension/popup.html", import.meta.url), "utf8"));
  const originalDocument = globalThis.document, originalChrome = globalThis.chrome;
  const values = {
    config: { enabled: true, workspace: "Example", expiresAt: "2026-11-20T00:00:00Z" },
    batch: { cnrs: ["KAAA010000012025"], index: 0, saved: 0, skipped: 0, failed: [], mode: "missing", state: "waiting", message: "One selected" },
  };
  const sent = [];
  let fail = false;
  let done;
  const rendered = () => new Promise(resolve => { done = resolve; });
  const status = document.getElementById("status");
  Object.defineProperty(status, "textContent", {
    configurable: true,
    set(value) { this.innerHTML = value; done?.(); },
    get() { return this.innerHTML; },
  });
  globalThis.document = document;
  globalThis.chrome = {
    storage: {
      local: { get: async () => structuredClone(values) },
      onChanged: { addListener() {} },
    },
    runtime: { sendMessage: async message => {
      sent.push(message);
      if (fail) return { error: "A case is loading" };
      values.batch = { ...values.batch, mode: message.mode, cnrs: [], state: "complete", message: "No matching cases" };
      return { batch: {} };
    } },
  };
  try {
    const ready = rendered();
    await import("../extension/popup.js");
    await ready;
    assert.equal(document.getElementById("fetch-missing").getAttribute("aria-pressed"), "true");
    const changed = rendered();
    document.getElementById("fetch-existing").dispatchEvent(new window.Event("click"));
    await changed;
    assert.deepEqual(sent, [{ type: "BATCH_START", mode: "existing" }]);
    assert.equal(document.getElementById("fetch-existing").getAttribute("aria-pressed"), "true");
    assert.equal(document.getElementById("batch-progress").hidden, true);
    assert.match(document.getElementById("batch-status").textContent, /0\/0 processed · 0 saved/);
    fail = true;
    const rejected = rendered();
    document.getElementById("fetch-missing").dispatchEvent(new window.Event("click"));
    await rejected;
    // Let the handler finish restoring its controls after reporting the error.
    await new Promise(resolve => setImmediate(resolve));
    assert.match(status.textContent, /case is loading/);
    assert.equal(document.getElementById("fetch-modes").disabled, false);
  } finally {
    globalThis.document = originalDocument;
    globalThis.chrome = originalChrome;
  }
});
