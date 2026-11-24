import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFile } from "node:fs/promises";
import "../extension/parser.js";
import "../extension/navigation.js";
const fixture = await readFile(
  new URL("./fixtures/case-details.html", import.meta.url),
  "utf8",
);
const cnr = "KAAA010000012025";
function page() {
  const { document, window } = parseHTML(
    '<html><body><table id="dispTable"><tr><td><a onclick="viewHistory(1,\'KAAA010000012025\',2)">View</a></td></tr></table><div id="details"></div></body></html>',
  );
  globalThis.MutationObserver = window.MutationObserver;
  return document;
}
const options = { isVisible: () => true, timeoutMs: 500, settleMs: 5 };
test("background request uses the matching live View control and checks CNR", async () => {
  const doc = page();
  let clicks = 0;
  doc.querySelector("a").addEventListener("click", () => {
    clicks++;
    doc.getElementById("details").innerHTML =
      parseHTML(fixture).document.body.innerHTML;
  });
  assert.equal(VerityNavigation.probe(doc, cnr, () => true).hasLink, true);
  const capture = await VerityNavigation.load(doc, cnr, options);
  assert.equal(clicks, 1);
  assert.equal(capture.cnr, cnr);
  assert.equal(capture.data.history.length, 5);
  // Reading the current page doesn't click again; an explicit refresh does.
  await VerityNavigation.load(doc, cnr, options);
  assert.equal(clicks, 1);
  await VerityNavigation.load(doc, cnr, { ...options, force: true });
  assert.equal(clicks, 2);
});
test("missing case or expired session returns action-needed instead of scraping another case", async () => {
  const doc = page();
  await assert.rejects(
    VerityNavigation.load(doc, "KAAA010000992025", options),
    /repeat the search/,
  );
  await assert.rejects(
    VerityNavigation.load(doc, cnr, options),
    /did not finish loading/,
  );
  doc.querySelector("a").addEventListener("click", () => {
    doc.getElementById("details").innerHTML = parseHTML(
      fixture.replaceAll(cnr, "KAAA010000022025"),
    ).document.body.innerHTML;
  });
  await assert.rejects(
    VerityNavigation.load(doc, cnr, options),
    /did not finish loading/,
  );
});
test("explicit refresh never treats unchanged old DOM as a fresh response", async () => {
  const doc = page();
  doc.getElementById("details").innerHTML =
    parseHTML(fixture).document.body.innerHTML;
  await assert.rejects(
    VerityNavigation.load(doc, cnr, { ...options, force: true }),
    /did not finish loading/,
  );
});

test("targeted View prevents tokenised href navigation while running its case handler", async () => {
  const doc = page();
  const link = doc.querySelector("a");
  let prevented = false;
  link.click = () => {
    const event = new doc.defaultView.Event("click", {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    prevented = event.defaultPrevented;
  };
  link.addEventListener("click", () => {
    doc.getElementById("details").innerHTML =
      parseHTML(fixture).document.body.innerHTML;
  });
  const result = await VerityNavigation.load(doc, cnr, options);
  assert.equal(result.cnr, cnr);
  assert.equal(prevented, true);
});
