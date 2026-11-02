import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";

test("analytics filters, paginates follow-up cases and opens saved details", async () => {
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
        filing_date: "01-01-2026",
        disposal_date: "31-01-2026",
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
          onOpenCase: (c) => {
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
    const button = (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === text,
      );
    assert.ok(
      document
        .querySelector(".analytics-filter-heading")
        .textContent.includes("13 of 13"),
    );
    const titles = [...document.querySelectorAll("h2")].map(node => node.textContent);
    for (const removed of ["Capture recency", "Date completeness", "Judge / courtroom distribution"])
      assert.ok(!titles.includes(removed), `${removed} is excluded from company analytics`);
    assert.ok(titles.includes("Disposal turnaround"));
    assert.ok(titles.includes("Filings & disposals"));
    assert.equal(document.querySelectorAll(".analytics-metrics article").length, 8);
    const metrics = [...document.querySelectorAll(".analytics-metrics article")];
    assert.equal(metrics.find(node => node.textContent.startsWith("Average disposal TAT")).querySelector("strong").textContent, "30 days");
    assert.equal(metrics.find(node => node.textContent.startsWith("Median disposal TAT")).querySelector("strong").textContent, "30 days");
    assert.equal(metrics.find(node => node.textContent.startsWith("Pending · over 1 year")).querySelector("strong").textContent, "12");
    assert.ok(!metrics.some(node => node.textContent.includes("Detail coverage")));
    assert.equal(document.querySelectorAll(".analytics-review-tabs button").length, 5);
    assert.equal(
      document.querySelectorAll(".analytics-review tbody tr").length,
      10,
    );
    await click(button("Next page"));
    assert.equal(
      document.querySelectorAll(".analytics-review tbody tr").length,
      2,
    );
    await click(document.querySelector(".analytics-review .case-open"));
    assert.ok(opened.cnr);
    const status = [...document.querySelectorAll("label")]
      .find((l) => l.textContent.startsWith("Status"))
      .querySelector("select");
    await act(async () => {
      for (const option of status.querySelectorAll("option"))
        option.selected = option.value === "Disposed";
      // Supply the browser-selected value explicitly for Linkedom.
      Object.defineProperty(status, "value", {
        configurable: true,
        value: "Disposed",
      });
      status.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.ok(
      document
        .querySelector(".analytics-filter-heading")
        .textContent.includes("1 of 13"),
    );
    assert.ok(
      document
        .querySelector(".analytics-review")
        .textContent.includes("No cases in this follow-up category"),
    );
    const disposed = [
      ...document.querySelectorAll(".analytics-review-tabs button"),
    ].find((b) => b.textContent.startsWith("Disposed"));
    await click(disposed);
    assert.equal(
      document.querySelectorAll(".analytics-review tbody tr").length,
      1,
    );
    await click(document.querySelector(".analytics-review .case-open"));
    assert.equal(opened.cnr, "KAAA010000992025");
    await click(button("Clear filters"));
    const longPending = [...document.querySelectorAll(".analytics-review-tabs button")].find(node => node.textContent.startsWith("Pending · over 1 year"));
    await click(longPending);
    assert.equal(document.querySelectorAll(".analytics-review tbody tr").length, 10);
    assert.match(document.querySelector(".analytics-review tbody").textContent, /days pending/);
    await click(document.querySelector(".analytics-review .case-open"));
    assert.equal(opened.data.case_status, "Pending");
    assert.ok(
      document
        .querySelector(".analytics-filter-heading")
        .textContent.includes("13 of 13"),
    );
  } finally {
    if (root) await act(async () => root.unmount());
    if (server) await server.close();
    for (const [k, d] of originals) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});
