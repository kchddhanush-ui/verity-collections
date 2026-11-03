import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../extension/search-form.js", import.meta.url), "utf8");

test("guided party search relays a live CAPTCHA and saves only fresh results after manual entry", async () => {
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
  const image = new EventTarget();
  Object.assign(image, {
    complete: true, naturalWidth: 120, naturalHeight: 40,
    src: "https://services.ecourts.gov.in/ecourtindia_v6/vendor/securimage/securimage_show.php",
  });
  const captcha = { value: "", dispatchEvent() {} };
  let table;
  let submissions = 0;
  let saves = 0;
  const results = { textContent: "", querySelector: () => table };
  const captured = { kind: "search_list", entries: [{ cnr: "KAAA010000012025" }] };
  const submit = { click() {
    submissions++;
    assert.equal(captcha.value, "AbC123");
    table = { innerHTML: "New search results" };
    image.dispatchEvent(new Event("load"));
  } };
  const fields = {
    sess_state_code: state,
    sess_dist_code: district,
    court_complex_code: complex,
    court_est_code: establishment,
    "partyname-tabMenu": { getAttribute: () => "true" },
    petres_name: nameInput,
    rgyearP: yearInput,
    radB: radio,
    fcaptcha_code: captcha,
    res_party: results,
  };
  let listener;
  runInNewContext(script, {
    Event, setTimeout, URL, crypto,
    location: { origin: "https://services.ecourts.gov.in" },
    VerityParser: {
      visible: () => true,
      extractSearch(_document, isVisible) {
        assert.ok(isVisible(table));
        return captured;
      },
    },
    VerityCapture: { async save(capture, force, session) {
      assert.equal(force, true);
      assert.match(session, /^[a-f0-9-]{36}$/);
      saves++;
      assert.equal(capture, captured);
      return { saved: true, message: "Search saved" };
    } },
    document: { getElementById(id) {
      assert.ok(id in fields, `unexpected form control: ${id}`);
      return fields[id];
    },
    querySelector(selector) {
      if (selector === "#div_captcha_party #captcha_image") return image;
      if (selector === "#res_party #dispTable") return table;
      if (selector.includes("refreshCaptcha()")) return { click: () => image.dispatchEvent(new Event("load")) };
      if (selector.includes("submit_party_name();")) return submit;
      throw new Error("Unexpected selector: " + selector);
    },
    querySelectorAll: () => [],
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        getContext: () => ({ drawImage(source) { assert.equal(source, image); } }),
        toDataURL: () => "data:image/png;base64,AA==",
      };
    } },
    chrome: { runtime: { id: "test", onMessage: { addListener(fn) { listener = fn; } } } },
  });
  const send = (payload) => new Promise((resolve) => {
    listener({ type: "PARTY_SEARCH_FORM", ...payload }, { id: "test" }, resolve);
  });
  assert.equal((await send({ step: "open" })).options[0].label, "Karnataka");
  const { pageId } = await send({ step: "identity" });
  assert.equal((await send({ step: "open", previousPage: pageId })).loading, true);
  nameInput.value = "Unsubmitted manual search";
  const draft = await send({ step: "open" });
  assert.equal(draft.needsReload, true);
  assert.equal(draft.pageId, pageId);
  assert.equal((await send({ step: "open", previousPage: "replaced-document" })).options[0].label, "Karnataka");
  nameInput.value = "";
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
  const original = await send(criteria);
  assert.match(original.image, /^data:image\/png;base64,/);
  assert.equal(submissions, 0);
  const fresh = await send({ step: "refresh" });
  assert.notEqual(fresh.challengeId, original.challengeId);
  assert.match((await send({ step: "submit", challengeId: original.challengeId, answer: "AbC123" })).error, /CAPTCHA changed/);
  assert.equal(submissions, 0);
  const saved = await send({ step: "submit", challengeId: fresh.challengeId, answer: "AbC123" });
  assert.equal(saved.saved, true);
  assert.match(saved.nextCaptcha.image, /^data:image\/png;base64,/);
  assert.notEqual(saved.nextCaptcha.challengeId, fresh.challengeId);
  assert.equal(submissions, 1);
  assert.equal(saves, 1);
  assert.equal(captcha.value, "");
  assert.match((await send({ step: "submit", challengeId: fresh.challengeId, answer: "AbC123" })).error, /CAPTCHA changed/);
  assert.equal(submissions, 1);
  assert.equal(nameInput.value, "Example Company");
  assert.equal(yearInput.value, "2025");
  assert.equal(radio.checked, true);
  district.options.push(option("21", "Another district"));
  assert.equal((await send({ step: 1, value: "21" })).options[0].label, "CMM Court Complex");
  assert.match((await send(criteria)).error, /Complete the court selections/);
  assert.match((await send({ step: "submit", challengeId: saved.nextCaptcha.challengeId, answer: "AbC123" })).error, /form changed/);
  assert.equal(submissions, 1);
});
