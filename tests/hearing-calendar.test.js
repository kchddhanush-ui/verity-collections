import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";

test("calendar navigates months, shows crowded dates and opens a saved case", async () => {
  const { window, document } = parseHTML(
    '<html><body><div id="root"></div></body></html>',
  );
  const originals = new Map(
    [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Node",
      "IS_REACT_ACT_ENVIRONMENT",
    ].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  for (const [k, value] of Object.entries({
    window,
    document,
    navigator: { userAgent: "test" },
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, k, {
      configurable: true,
      writable: true,
      value,
    });
  let server, root;
  try {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      server: { middlewareMode: true, hmr: { server: createHttpServer() } },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const { HearingCalendar } = await server.ssrLoadModule(
      "/src/components/HearingCalendar.jsx",
    );
    const cases = Array.from({ length: 5 }, (_, i) => ({
      cnr: `KAAA0100000${i + 1}2025`,
      hasDetails: true,
      data: {
        case_reference: `C.C./${i + 1}/2025`,
        petitioners: [`Company ${i + 1}`],
        next_hearing_date: "16th November 2026",
      },
    }));
    let opened;
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(
        React.createElement(HearingCalendar, {
          cases,
          today: "2026-10-29",
          onOpenCase: (c) => {
            opened = c;
          },
        }),
      ),
    );
    const button = (label) =>
      [...document.querySelectorAll("button")].find(
        (b) =>
          b.textContent === label || b.getAttribute("aria-label") === label,
      );
    const click = async (node) => {
      assert.ok(node);
      await act(async () =>
        node.dispatchEvent(new window.Event("click", { bubbles: true })),
      );
    };
    assert.ok(
      document
        .querySelector(".hearing-month-nav")
        .textContent.includes("October 2026"),
    );
    await click(button("Next month"));
    assert.ok(
      document
        .querySelector(".hearing-month-nav")
        .textContent.includes("November 2026"),
    );
    assert.equal(document.querySelectorAll(".hearing-day-cases li").length, 3);
    await click(button("+2 more · show all"));
    assert.equal(document.querySelectorAll(".hearing-agenda li").length, 5);
    assert.equal(
      document.getElementById("hearing-day-title").textContent,
      "16 November 2026",
    );
    await click(document.querySelector(".hearing-agenda .case-open"));
    assert.equal(opened.cnr, cases[0].cnr);
    await click(button("Today"));
    assert.ok(
      document
        .querySelector(".hearing-month-nav")
        .textContent.includes("October 2026"),
    );
    assert.equal(
      document.getElementById("hearing-day-title").textContent,
      "29 October 2026",
    );
    await click(button("Next scheduled hearing"));
    assert.equal(
      document.getElementById("hearing-day-title").textContent,
      "16 November 2026",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    if (server) await server.close();
    for (const [k, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor);
      else delete globalThis[k];
    }
  }
});
