import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";
import { resolveEntryView } from "../src/lib/entry-view.js";

test("guest entry, explicit public home and client login preserve the authentication boundary", () => {
  const guest = { loading: false, session: null, recovering: false };
  const member = { ...guest, session: { user: { id: "member" } } };
  assert.equal(resolveEntryView({}, guest), "public");
  assert.equal(resolveEntryView({ search: "?view=login" }, guest), "login");
  assert.equal(resolveEntryView({ search: "?view=workspace" }, guest), "public");
  assert.equal(resolveEntryView({}, member), "workspace");
  assert.equal(resolveEntryView({ search: "?view=login" }, member), "workspace");
  assert.equal(resolveEntryView({ search: "?view=home" }, member), "public");
  assert.equal(resolveEntryView({ search: "?view=login" }, { ...guest, loading: true }), "loading");
});

test("recovery links stay in recovery or login instead of landing on the marketing page", () => {
  for (const location of [
    { search: "?mode=recovery" },
    { search: "?view=home&mode=recovery" },
    { search: "?view=home", hash: "#access_token=example&type=recovery" },
  ]) {
    assert.equal(resolveEntryView(location, { session: null }), "login");
    assert.equal(resolveEntryView(location, { session: { user: { id: "member" } } }), "recovery");
  }
  assert.equal(resolveEntryView({ search: "?view=home" }, { recovering: true, session: { user: {} } }), "recovery");
});

test("public page links reach real sections and partner choices show the relevant portfolio", async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const values = { window, document, navigator: { userAgent: "test" }, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const originals = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let scrolledTo = "";
  window.location = { hash: "#partners" };
  window.HTMLElement.prototype.scrollIntoView = function () { scrolledTo = this.id; };
  let server, root;
  try {
    server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: { server: createHttpServer() } }, optimizeDeps: { noDiscovery: true, include: [] } });
    const { PublicLanding } = await server.ssrLoadModule("/src/components/PublicLanding.jsx");
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(PublicLanding)));
    assert.equal(scrolledTo, "partners", "a section URL works on the initial React render");
    assert.equal(document.querySelectorAll("h1").length, 1);
    for (const link of document.querySelectorAll('a[href^="#"]')) assert.ok(document.getElementById(link.getAttribute("href").slice(1)), link.textContent);
    for (const link of document.querySelectorAll(".lp-login, .lp-closing-actions > a:first-child")) assert.equal(link.getAttribute("href"), "?view=login");
    const buttons = [...document.querySelectorAll(".lp-partner-options button")];
    assert.equal(buttons[0].getAttribute("aria-pressed"), "true");
    await act(async () => buttons[1].dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
    assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
    assert.match(document.querySelector(".lp-partner-copy h3").textContent, /secured and unsecured/);
    await act(async () => buttons[2].dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.match(document.querySelector(".lp-partner-copy h3").textContent, /digital loan defaults/);
    assert.ok(!document.querySelector(".console-sidebar"), "the public view contains no company workspace");
  } finally {
    if (root) await act(async () => root.unmount());
    await server?.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
