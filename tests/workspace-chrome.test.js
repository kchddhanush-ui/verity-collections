import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";

test("reference workspace shell uses account data, navigates, searches and reports only confirmed refreshes", async () => {
  const { window, document } = parseHTML(
    '<html><body><div id="root"></div></body></html>',
  );
  const values = {
    window,
    document,
    navigator: { userAgent: "test" },
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(
    Object.keys(values).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  window.HTMLElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  window.HTMLElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
  let focused;
  window.HTMLElement.prototype.focus = function () {
    focused = this;
  };
  let server,
    root,
    refreshes = 0,
    signedOut = 0,
    success = true;
  try {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      server: { middlewareMode: true, hmr: { server: createHttpServer() } },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const { WorkspaceChrome } = await server.ssrLoadModule(
      "/src/components/WorkspaceChrome.jsx",
    );
    function Harness() {
      const [page, onNavigate] = useState("calendar"),
        [workspace, onWorkspace] = useState("alpha"),
        [query, onQuery] = useState("initial search");
      return React.createElement(
        WorkspaceChrome,
        {
          session: {
            user: {
              email: "operator@example.test",
              user_metadata: { full_name: "Example Operator" },
            },
          },
          workspaces: [
            { id: "alpha", name: "Alpha Company" },
            { id: "beta", name: "Beta Company" },
          ],
          workspace,
          onWorkspace,
          page,
          onNavigate,
          query,
          onQuery,
          count: 7,
          busy: false,
          loading: false,
          pending: false,
          onRefresh: async () => {
            refreshes++;
            return success;
          },
          onSignOut: () => {
            signedOut++;
          },
        },
        React.createElement(
          "main",
          { id: "workspace-content" },
          `${page} / ${workspace}`,
        ),
      );
    }
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(Harness)));
    const button = (label) =>
      [...document.querySelectorAll("button")].find(
        (node) =>
          node.textContent.trim() === label ||
          node.getAttribute("aria-label") === label,
      );
    const click = async (node) => {
      assert.ok(node);
      await act(async () =>
        node.dispatchEvent(new window.Event("click", { bubbles: true })),
      );
    };
    assert.match(
      document.querySelector(".profile-summary").textContent,
      /Example Operator/,
    );
    assert.doesNotMatch(
      document.querySelector(".profile-summary").textContent,
      /Company workspace/,
    );
    assert.ok(
      !document.body.textContent.includes("Legal Operations Admin"),
      "reference mock roles are not copied",
    );
    assert.equal(document.querySelector(".nav-badge"), null, "sidebar shows no case count");
    assert.equal(
      document.querySelector(".console-brand .lawcovery-logo").getAttribute("src"),
      "/lawcovery-logo-legal-recovery.svg",
    );
    assert.match(document.querySelector(".nav-label").textContent, /Legal collections/);
    assert.match(document.querySelector(".audit-card").textContent, /A record of every change/);
    assert.match(document.querySelector(".workspace-status").textContent, /Company workspace/);
    assert.match(document.querySelector(".workspace-view-header").textContent, /Hearing calendar/);
    assert.equal(
      document.querySelector(".theme-toggle"),
      null,
      "the signed-in workspace uses one light theme and has no mode switcher",
    );
    assert.deepEqual(
      [...document.querySelectorAll(".sidebar-nav button")].map((node) => node.getAttribute("aria-label")),
      ["Analytics", "Cases", "Loan data", "Hearing calendar", "Legal and recovery flow", "Zone tracker", "Connections"],
    );
    await click(button("Loan data"));
    assert.match(document.querySelector("main").textContent, /loan-data/);
    assert.match(document.querySelector(".workspace-view-header").textContent, /Loan data/);
    assert.equal(
      document.querySelector(".global-search"),
      null,
      "the header has no separate search box; search lives on the Cases page",
    );
    const command = new window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(command, { key: "k", ctrlKey: true });
    await act(async () => document.dispatchEvent(command));
    assert.match(document.querySelector("main").textContent, /cases/);
    assert.match(document.querySelector(".workspace-view-header").textContent, /Cases/);
    await click(button("Account: Example Operator"));
    assert.match(
      document.querySelector(".profile-menu").textContent,
      /operator@example.test/,
    );
    await click(button("Profile settings"));
    assert.ok(document.querySelector("dialog[open]"));
    assert.match(document.querySelector("dialog").textContent, /Alpha Company/);
    await click(button("Close"));
    assert.equal(document.querySelector("dialog"), null);
    await click(button("Account: Example Operator"));
    await act(async () =>
      document.body.dispatchEvent(
        new window.Event("pointerdown", { bubbles: true }),
      ),
    );
    assert.equal(document.querySelector(".profile-menu"), null);
    await click(button("Account: Example Operator"));
    await click(button("Workspace access"));
    assert.match(document.querySelector("dialog").textContent, /Beta Company/);
    await click(button("Close"));
    await click(button("Open menu"));
    assert.ok(document.querySelector(".sidebar-open"));
    assert.ok(document.querySelector(".console-body").hasAttribute("inert"));
    await click(
      document.querySelector('.sidebar-nav [aria-label="Hearing calendar"]'),
    );
    assert.equal(document.querySelector(".sidebar-open"), null);
    assert.ok(!document.querySelector(".console-body").hasAttribute("inert"));
    assert.match(document.querySelector("main").textContent, /calendar/);
    await click(button("Open menu"));
    const escape = new window.Event("keydown", { bubbles: true });
    Object.assign(escape, { key: "Escape" });
    await act(async () => document.dispatchEvent(escape));
    assert.equal(document.querySelector(".sidebar-open"), null);
    assert.equal(focused.getAttribute("aria-label"), "Open menu");
    await click(document.querySelector(".refresh-button"));
    assert.equal(refreshes, 1);
    assert.match(
      document.querySelector('[role="status"]').textContent,
      /refreshed successfully/,
    );
    success = false;
    await click(document.querySelector(".refresh-button"));
    assert.equal(refreshes, 2);
    assert.equal(
      document.querySelector(".toast"),
      null,
      "failed refreshes must not show a success toast",
    );
    // Hide and show tabs from the profile menu.
    await click(button("Account: Example Operator"));
    assert.equal(button("Show or hide tabs"), undefined, "tab settings live inside Profile settings");
    await click(button("Profile settings"));
    assert.match(document.querySelector("dialog").textContent, /Sidebar tabs/);
    const sidebarLabels = () =>
      [...document.querySelectorAll(".sidebar-nav button")].map((node) => node.getAttribute("aria-label"));
    await click(button("Show Cases tab"));
    assert.deepEqual(sidebarLabels(), ["Analytics", "Loan data", "Hearing calendar", "Legal and recovery flow", "Zone tracker", "Connections"]);
    assert.equal(button("Show Cases tab").getAttribute("aria-checked"), "false");
    // Hiding the page you are on moves you to the first visible tab.
    assert.match(document.querySelector("main").textContent, /calendar/);
    await click(button("Show Hearing calendar tab"));
    assert.match(document.querySelector("main").textContent, /analytics/);
    assert.deepEqual(sidebarLabels(), ["Analytics", "Loan data", "Legal and recovery flow", "Zone tracker", "Connections"]);
    await click(button("Show Cases tab"));
    await click(button("Show Hearing calendar tab"));
    assert.deepEqual(sidebarLabels(), ["Analytics", "Cases", "Loan data", "Hearing calendar", "Legal and recovery flow", "Zone tracker", "Connections"]);
    await click(button("Close"));
    await click(button("Account: Example Operator"));
    await click(button("Sign out"));
    assert.equal(signedOut, 1);
  } finally {
    if (root) await act(async () => root.unmount());
    if (server) await server.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
