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
    let simulatedSuccess = false;
    window.postMessage = (message) =>
      queueMicrotask(() => {
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
                ? { connected: true }
                : simulatedSuccess
                  ? { saved: true, message: "Case saved" }
                  : {
                      error: "Action needed on eCourts: complete CAPTCHA",
                      actionNeeded: true,
                    },
          },
        });
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
    const view = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("View ·"),
    );
    assert.ok(view, "listed case has a View control");
    await act(async () =>
      view.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    const dialog = document.querySelector("dialog[open]");
    assert.ok(dialog, "case opens immediately in modal");
    assert.ok(dialog.textContent.includes("C.C./1/2025"));
    assert.ok(
      dialog
        .querySelector('[role="status"]')
        .textContent.includes("complete CAPTCHA"),
    );
    assert.ok(
      [...dialog.querySelectorAll("button")].some(
        (b) => b.textContent === "Go to eCourts tab",
      ),
    );
    const close = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === "Close details",
    );
    await act(async () =>
      close.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    assert.equal(document.querySelector("dialog"), null);
    simulatedSuccess = true;
    await act(async () =>
      view.dispatchEvent(new window.Event("click", { bubbles: true })),
    );
    const updated = document.querySelector("dialog[open]");
    assert.ok(updated, "successful fetch also opens the case dialog");
    assert.ok(updated.querySelector(".case-facts").textContent.includes("NBW"));
    assert.ok(
      updated
        .querySelector('[role="status"]')
        .textContent.includes("Case saved"),
    );
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
