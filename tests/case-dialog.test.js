import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";

test("clicking a listed case opens a dialog with fetching errors next to its details", async () => {
  const { window, document } = parseHTML(
    '<html><body><div id="test-root"></div></body></html>',
  );
  const originals = new Map(
    [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Node",
      "IS_REACT_ACT_ENVIRONMENT",
      "__testSupabase",
    ].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  const set = (k, value) =>
    Object.defineProperty(globalThis, k, {
      configurable: true,
      writable: true,
      value,
    });
  const temp = await mkdtemp(
    path.join(process.cwd(), "node_modules/.verity-dialog-test-"),
  );
  let server, root;
  try {
    set("window", window);
    set("document", document);
    set("navigator", { userAgent: "test" });
    set("HTMLElement", window.HTMLElement);
    set("Node", window.Node);
    set("IS_REACT_ACT_ENVIRONMENT", true);
    window.location = { origin: "http://127.0.0.1:5173" };
    window.HTMLElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    window.HTMLElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    const cnr = "KAAA010000012025";
    const tables = {
      workspaces: [{ id: "workspace-a", name: "Example" }],
      court_cases: [],
      case_listings: [
        {
          id: "listing-a",
          cnr,
          data: {
            parties_text: "Example petitioner versus Respondent",
            serial_number: "8",
            registration_number: "1/2025",
            case_reference: "C.C./1/2025",
            petitioners: ["Example"],
            respondents: ["Respondent"],
          },
          last_seen_at: new Date().toISOString(),
        },
      ],
      court_search_captures: [],
      case_audit: [],
      case_captures: [],
      listing_audit: [],
    };
    const builder = (table) => {
      const x = {
        select: () => x,
        eq: () => x,
        order: () => x,
        limit: () => x,
        then: (yes, no) =>
          Promise.resolve({ data: tables[table] || [], error: null }).then(
            yes,
            no,
          ),
      };
      return x;
    };
    set("__testSupabase", {
      from: builder,
      rpc: async () => ({ data: [], error: null }),
    });
    const mock = path.join(temp, "supabase.mjs");
    await writeFile(mock, "export const supabase=globalThis.__testSupabase;");
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: { alias: [{ find: "./lib/supabase", replacement: mock }] },
    });
    const { CaseWorkspace } = await server.ssrLoadModule(
      "/src/CaseWorkspace.jsx",
    );
    let simulatedSuccess = false, oldExtension = true, extensionConnected = false;
    const batchRequests = [];
    let simulatedBatch = { id: "queue-a", mode: "missing", state: "waiting", total: 1, sourceTotal: 1,
      existingDetails: 0, missingDetails: 1, processed: 0, saved: 0, skipped: 0, waiting: 1, failed: 0, current: cnr, message: "Missing details selected" };
    window.postMessage = (message) =>
      queueMicrotask(() => {
        batchRequests.push(message);
        if (message.action === "BATCH_START") simulatedBatch = { ...simulatedBatch, id: crypto.randomUUID(), mode: message.payload.mode,
          total: 0, waiting: 0, current: "", state: "complete", message: "No matching cases" };
        if (message.action === "FETCH_CASE" && simulatedSuccess)
          tables.court_cases = [
            {
              id: "case-a",
              cnr,
              data: {
                registration_number: "1/2025",
                court: "Example Court",
                case_stage: "NBW",
                case_status: "Pending",
                decision_date: "07-10-2026",
              },
              last_checked_at: new Date().toISOString(),
            },
          ];
        const event = new window.Event("message");
        Object.assign(event, {
          source: window,
          origin: window.location.origin,
          data: {
            channel: "VERITY_DASHBOARD_RESPONSE",
            id: message.id,
            result:
              message.action === "PING"
                ? oldExtension ? { connected: true, version: "1.4.0" } : { connected: extensionConnected, version: "1.7.0", autoConnect: true, automaticFetchMode: "missing" }
                : message.action === "AUTO_CONNECT"
                  ? { state: "connected" }
                : ["BATCH_STATUS", "BATCH_START"].includes(message.action)
                  ? { batch: simulatedBatch }
                : simulatedSuccess
                  ? { saved: true, message: "Case saved" }
                  : {
                      error: "Action needed on eCourts: complete CAPTCHA",
                      actionNeeded: true,
                    },
          },
        });
        if (message.action === "AUTO_CONNECT") extensionConnected = true;
        window.dispatchEvent(event);
      });
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("test-root"));
    await act(async () =>
      root.render(
        React.createElement(CaseWorkspace, {
          session: {
            user: { id: "user-a", email: "example@example.com" },
            access_token: "not-a-real-token",
          },
          onSignOut: () => {},
          pending: false,
        }),
      ),
    );
    assert.ok(document.querySelector("main.page-cases .cases-card"), "Cases opens by default");
    const caseNav = document.querySelector('.sidebar-nav button[aria-label="Cases"]');
    assert.equal(caseNav.getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector(".batch-capture-panel"), null, "Court sync is absent from Cases");
    assert.equal(document.querySelector('[role="alert"]'), null, "connection update notices stay in Connections");
    await act(async () =>
      document.querySelector('.sidebar-nav button[aria-label="Connections"]')
        .dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.match(document.querySelector('[role="alert"]').textContent, /Chrome is running Lawcovery Case Capture 1.4.0/);
    assert.equal(document.querySelector(".batch-capture-panel"), null, "old worker queues are not presented as the fixed implementation");
    oldExtension = false;
    await act(async () =>
      root.render(
        React.createElement(CaseWorkspace, {
          session: {
            user: { id: "user-a", email: "example@example.com" },
            access_token: "refreshed-test-token",
          },
          onSignOut: () => {},
          pending: false,
        }),
      ),
    );
    const missingButton = [...document.querySelectorAll("button")].find(b => b.textContent === "Fetch missing details");
    const existingButton = [...document.querySelectorAll("button")].find(b => b.textContent === "Refresh existing details");
    assert.ok(missingButton && existingButton, "Connections exposes both fetch modes");
    assert.equal(missingButton.getAttribute("aria-pressed"), "true");
    assert.match(document.querySelector(".batch-capture-panel").textContent, /0 already saved.*1 missing details/);
    assert.equal(document.querySelector('[role="alert"]'), null, "extension upgrade clears the old-version notice");
    await act(async () => existingButton.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.equal(existingButton.getAttribute("aria-pressed"), "true");
    const modeRequest = batchRequests.find(m => m.action === "BATCH_START");
    assert.equal(modeRequest.payload.mode, "existing");
    assert.equal(modeRequest.payload.workspace, "workspace-a");
    assert.ok(document.querySelector('.batch-capture-panel progress').hasAttribute("hidden"), "zero matching cases do not show an indeterminate bar");
    assert.equal(batchRequests.filter(m => m.action === "FETCH_CASE").length, 0);
    assert.equal(document.querySelector('.sidebar-nav button[aria-label="Overview"]'), null);
    assert.equal(document.querySelector('.sidebar-nav button[aria-label="Analytics"]'), null);
    await act(async () =>
      caseNav.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.equal(document.querySelector(".batch-capture-panel"), null, "Court sync is absent from Cases");

    assert.ok(document.querySelector('.skip-link[href="#workspace-content"]'));
    await act(async () =>
      document
        .querySelector('.sidebar-nav button[aria-label="Connections"]')
        .dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.ok(
      document.querySelector(".connection-panel"),
      "connections has its own view",
    );
    assert.ok(document.querySelector(".batch-capture-panel"), "Court sync returns when opening Connections");
    assert.ok(batchRequests.some(request => request.action === "AUTO_CONNECT" && !request.payload.connect));
    assert.match(document.querySelector(".connection-panel [role=status]").textContent, /Chrome connected/);
    assert.ok(
      ![...document.querySelectorAll(".connection-panel button")].some(
        button => button.textContent === "Connect this workspace",
      ),
      "an automatically connected workspace does not show a manual connection button",
    );
    await act(async () =>
      document
        .querySelector('.sidebar-nav button[aria-label="Hearing calendar"]')
        .dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.ok(
      document.querySelector(".hearing-calendar"),
      "calendar remains reachable from navigation",
    );
    assert.equal(document.querySelector(".batch-capture-panel"), null, "Court sync is absent from the calendar");
    await act(async () =>
      caseNav.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.equal(document.querySelector(".batch-capture-panel"), null, "Court sync is absent from Cases");
    const view = [...document.querySelectorAll("button")].find((b) =>
      b.classList.contains("case-open"),
    );
    assert.ok(view, "listed case has a View control");
    await act(async () =>
      view.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    const dialog = document.querySelector("dialog[open]");
    assert.ok(dialog, "case opens immediately in modal");
    assert.ok(dialog.textContent.includes("C.C./1/2025"));
    const factLabels = [...dialog.querySelectorAll(".case-facts dt")].map(node => node.textContent);
    assert.deepEqual(factLabels, ["Case reference", "Case number", "Parties", "Search result row"]);
    assert.ok(!dialog.querySelector(".case-facts").textContent.includes("parties_text"));
    assert.equal(dialog.querySelector(".case-fact-wide dd").textContent, "Example petitioner versus Respondent");
    assert.match(dialog.querySelector('[role="status"]').textContent, /Refresh is not confirmed/);
    assert.ok(!dialog.textContent.includes("complete CAPTCHA"), "portal troubleshooting stays in Connections");
    const connectionStatus = [...dialog.querySelectorAll("button")].find(b => b.textContent === "View connection status");
    await act(async () => connectionStatus.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.equal(document.querySelector("dialog"), null);
    const portalLinks = () => [...document.querySelectorAll("a")].filter(a => a.textContent.replace(/\s+/g, " ").trim() === "Open eCourts");
    assert.equal(portalLinks().length, 1, "Connections provides the portal link");
    assert.match(document.querySelector('.case-fetch-status[role="status"]').textContent, /complete CAPTCHA/);
    assert.ok([...document.querySelectorAll("button")].some(b => b.textContent === "Go to eCourts tab"));
    for (const label of ["Hearing calendar", "Cases"]) {
      await act(async () => document.querySelector(`.sidebar-nav button[aria-label="${label}"]`).dispatchEvent(new window.Event("click", { bubbles: true })));
      assert.equal(portalLinks().length, 0, `${label} does not show Open eCourts`);
      assert.equal(document.querySelector('.case-fetch-status[role="status"]'), null, `${label} does not repeat connection messages`);
    }
    simulatedSuccess = true;
    const freshView = [...document.querySelectorAll("button")].find(b => b.classList.contains("case-open"));
    await act(async () =>
      freshView.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    const updated = document.querySelector("dialog[open]");
    assert.ok(updated, "successful fetch also opens the case dialog");
    assert.ok(updated.querySelector(".case-facts").textContent.includes("NBW"));
    assert.ok(
      updated
        .querySelector(".case-facts")
        .textContent.includes("Decision Date"),
    );
    assert.ok(
      updated.querySelector(".case-facts").textContent.includes("07-10-2026"),
    );
    assert.ok(
      updated
        .querySelector('[role="status"]')
        .textContent.includes("Case saved"),
    );
    const close = [...updated.querySelectorAll("button")].find(b => b.textContent === "Close details");
    await act(async () => close.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.equal(document.querySelector("dialog"), null);
  } finally {
    if (root) await act(async () => root.unmount());
    if (server) await server.close();
    await rm(temp, { recursive: true, force: true });
    for (const [k, d] of originals) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});
