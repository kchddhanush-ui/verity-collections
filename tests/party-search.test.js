import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../extension/search-form.js", import.meta.url), "utf8");

test("guided party search follows the portal's dependent choices and leaves submission to the user", async () => {
  const option = (value, textContent) => ({ value, textContent });
  const select = (options, update = () => {}) => ({
    value: "",
    options,
    dispatchEvent(event) {
      if (event.type === "change") update();
    },
  });
  const establishment = select([]);
  const complex = select([], () => {
    establishment.options = [option("2", "Chief Metropolitan Magistrate Court")];
  });
  const district = select([option("99", "Old district")], () => {
    complex.options = [option("1030134@2,5@Y", "CMM Court Complex")];
  });
  const state = select([option("0", "Select state"), option("3", "Karnataka")], () => {
    setTimeout(() => { district.options = [option("20", "Bengaluru")]; }, 10);
  });
  const nameInput = { value: "", dispatchEvent() {} };
  const yearInput = { value: "", dispatchEvent() {} };
  const radio = { checked: false, click() { this.checked = true; } };
  const fields = {
    sess_state_code: state,
    sess_dist_code: district,
    court_complex_code: complex,
    court_est_code: establishment,
    "partyname-tabMenu": { getAttribute: () => "true" },
    petres_name: nameInput,
    rgyearP: yearInput,
    radB: radio,
  };
  let listener;
  runInNewContext(script, {
    Event, setTimeout,
    document: { getElementById(id) {
      assert.ok(id in fields, `unexpected form control: ${id}`);
      return fields[id];
    } },
    chrome: { runtime: { id: "test", onMessage: { addListener(fn) { listener = fn; } } } },
  });
  const send = (payload) => new Promise((resolve) => {
    listener({ type: "PARTY_SEARCH_FORM", ...payload }, { id: "test" }, resolve);
  });
  assert.equal((await send({ step: "open" })).options[0].label, "Karnataka");
  assert.match((await send({ step: 1, value: "99" })).error, /current eCourts list/);
  assert.equal((await send({ step: 0, value: "3" })).options[0].label, "Bengaluru");
  assert.equal((await send({ step: 1, value: "20" })).options[0].label, "CMM Court Complex");
  assert.equal((await send({ step: 2, value: "1030134@2,5@Y" })).options[0].value, "2");
  assert.equal((await send({ step: 3, value: "2" })).error, undefined);
  const criteria = { step: "prepare", party: "Example Company", year: "2025", status: "Both" };
  district.value = "99";
  assert.match((await send(criteria)).error, /changed in eCourts/);
  assert.equal(nameInput.value, "");
  district.value = "20";
  assert.equal((await send(criteria)).ready, true);
  assert.equal(nameInput.value, "Example Company");
  assert.equal(yearInput.value, "2025");
  assert.equal(radio.checked, true);
});
