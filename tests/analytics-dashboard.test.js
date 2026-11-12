import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";

test("analytics shows pending stages, carries filing year into drill-down and compares annual events", async () => {
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
    const { AnalyticsDashboard } = await server.ssrLoadModule(
      "/src/components/AnalyticsDashboard.jsx",
    );
    const cases = Array.from({ length: 12 }, (_, i) => ({
      cnr: `KAAA0100${String(i + 1).padStart(4, "0")}2025`,
      hasDetails: true,
      data: {
        case_reference: `C.C./${i + 1}/2025`,
        case_type: "C.C.",
        case_status: "Pending",
        case_stage: "SUMMONS",
        history: [
          ["Judge", "01-01-2025", "11-01-2025", "NBW"],
          ["Judge", "11-01-2025", "21-01-2025", "NBW"],
          ["Judge", "21-01-2025", "31-01-2025", "SUMMONS"],
          ["Judge", "31-01-2025", "20-02-2025", "NBW"],
          ["Judge", "20-02-2025", "01-03-2025", "SUMMONS"],
        ],
        court: "Example Court",
        next_hearing_date: "16-11-2026",
        filing_date: "01-01-2025",
      },
    }));
    cases.push({
      cnr: "KAAA010000992025",
      hasDetails: true,
      data: {
        case_reference: "C.C./99/2025",
        case_status: "Disposed",
        filing_date: "01-02-2025",
        disposal_date: "31-01-2026",
        case_stage: "ARGUMENTS",
        court: "Example Court",
      },
    });
    let opened;
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(
        React.createElement(AnalyticsDashboard, {
          cases,
          today: "2026-10-29",
          onStageCases: (c) => {
            opened = c;
          },
        }),
      ),
    );
    const click = async (node) => {
      assert.ok(node);
      await act(async () =>
        node.dispatchEvent(new window.Event("click", { bubbles: true })),
      );
    };
    const change = async (label, value) => {
      const select = [...document.querySelectorAll("label")]
        .find((node) => node.textContent.startsWith(label)).querySelector("select");
      await act(async () => {
        Object.defineProperty(select, "value", { configurable: true, value });
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
    };
    assert.equal(document.querySelectorAll(".analytics-metrics article").length, 6);
    const cards = [...document.querySelectorAll("button.pending-stage-card")];
    assert.match(cards[0].textContent, /SUMMONS.*12 cases.*100%/);
    assert.equal(cards.length, 1);
    assert.ok(cards.every((card) => !card.textContent.includes("days")));
    const nbwTurnaround = [...document.querySelectorAll(".stage-turnaround-card")]
      .find((card) => card.textContent.startsWith("NBW"));
    assert.match(nbwTurnaround.textContent, /20 days.*Based on 12 cases/);
    await change("Filing year", "2025");
    await click(document.querySelector(".pending-stage-card"));
    assert.equal(opened.year, "2025");
    assert.equal(opened.stage, "SUMMONS");
    assert.equal(opened.status, "Pending");
    await change("Trend window", "annual");
    const annual = document.querySelector(".analytics-primary-trend tbody");
    const rows = [...annual.querySelectorAll("tr")].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    assert.deepEqual(rows, [["2026", "0", "1"], ["2025", "13", "0"]]);
    await change("Status", "Disposed");
    assert.match(document.querySelector(".analytics-filter-heading").textContent, /1 of 13/);
    assert.equal(document.querySelectorAll("button.pending-stage-card").length, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    if (server) await server.close();
    for (const [k, d] of originals) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});
