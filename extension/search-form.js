// Guided Party Name searches use the live form and its original eCourts session.
(() => {
  const ids = ["sess_state_code", "sess_dist_code", "court_complex_code", "court_est_code"];
  const selected = [];
  const pageId = crypto.randomUUID();
  const field = (index) => ids[index] ? document.getElementById(ids[index]) : null;

  function options(index) {
    return [...(field(index)?.options || [])]
      .filter((option) => !option.disabled && option.value && option.value !== "0")
      .map((option) => ({ value: option.value, label: option.textContent.trim() }))
      .filter(({ value, label }) => value.length <= 500 && label && label.length <= 300)
      .slice(0, 1000);
  }

  function assertSelections() {
    if (selected.some((value, index) => field(index)?.value !== value)) {
      throw new Error("Court selections changed in eCourts. Start a new search in Lawcovery.");
    }
  }

  let prepared;
  let challenge;
  let submitting = false;
  globalThis.VerityPartySearch = { get submitting() { return submitting; } };

  async function waitFor(read, timeout = 12000) {
    const deadline = Date.now() + timeout;
    do {
      const result = read();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    return null;
  }

  const captchaImage = () => document.querySelector("#div_captcha_party #captcha_image");
  const captchaInput = () => document.getElementById("fcaptcha_code");

  async function readChallenge() {
    challenge = undefined;
    const image = await waitFor(() => {
      const candidate = captchaImage();
      return candidate?.complete && candidate.naturalWidth && candidate.naturalHeight && candidate;
    });
    if (!image || !captchaInput() || image.naturalWidth > 800 || image.naturalHeight > 300)
      throw new Error("The eCourts CAPTCHA did not load. Open the court tab to continue.");
    const src = image.currentSrc || image.src;
    const url = new URL(src);
    if (url.origin !== location.origin || !url.pathname.startsWith("/ecourtindia_v6/"))
      throw new Error("The CAPTCHA image changed. Open the court tab to continue.");

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const data = canvas.toDataURL("image/png");
    if (!data.startsWith("data:image/png;base64,") || data.length > 350000)
      throw new Error("The CAPTCHA image could not be displayed. Open the court tab to continue.");

    const id = crypto.randomUUID();
    challenge = { id, image, src };
    image.addEventListener("load", () => {
      if (challenge?.id === id) challenge = undefined;
    }, { once: true });
    return { challengeId: id, image: data };
  }

  function assertPrepared() {
    if (!prepared ||
        prepared.tab.getAttribute("aria-selected") !== "true" ||
        prepared.nameInput.value !== prepared.party ||
        prepared.yearInput.value !== prepared.year ||
        !prepared.radio.checked)
      throw new Error("The Party Name form changed in eCourts. Start a new search.");
  }

  async function refreshChallenge() {
    const button = document.querySelector('#div_captcha_party [onclick="refreshCaptcha()"]');
    const image = captchaImage();
    if (!button || !image) throw new Error("Open the eCourts tab to refresh the CAPTCHA.");
    for (const modal of document.querySelectorAll("#bs_alert, #validateError")) {
      if (VerityParser.visible(modal)) modal.querySelector('[data-bs-dismiss="modal"]')?.click();
    }
    const src = image.currentSrc || image.src;
    let loaded = false;
    const onLoad = () => { loaded = true; };
    image.addEventListener("load", onLoad);
    challenge = undefined;
    try {
      button.click();
      const refreshed = await waitFor(() => {
        const next = captchaImage();
        return next?.complete && next.naturalWidth &&
          (loaded || next !== image || (next.currentSrc || next.src) !== src);
      });
      if (!refreshed) throw new Error("eCourts did not refresh the CAPTCHA. Open the court tab to continue.");
      return await readChallenge();
    } finally {
      image.removeEventListener("load", onLoad);
    }
  }

  function visibleAlert() {
    return [...document.querySelectorAll("#bs_alert, #validateError")]
      .filter(VerityParser.visible)
      .map((node) => node.querySelector(".modal-body")?.textContent.trim() || "")
      .join(" ");
  }

  async function submit(challengeId, answer) {
    const input = captchaInput();
    const button = document.querySelector('#frmsearch_name button[onclick="submit_party_name();"]');
    if (!input || !button) throw new Error("The eCourts search controls changed. Open the court tab.");
    if (typeof answer !== "string" || !/^[a-z0-9]{1,6}$/i.test(answer))
      throw new Error("Enter the letters or numbers shown in the CAPTCHA.");
    const image = captchaImage();
    if (!challenge || challenge.id !== challengeId || challenge.image !== image ||
        !image.complete || (image.currentSrc || image.src) !== challenge.src)
      throw new Error("The eCourts CAPTCHA changed. Get a new CAPTCHA and try again.");

    challenge = undefined;
    const results = () => document.getElementById("res_party");
    const oldTable = results()?.querySelector("#dispTable");
    const oldRows = oldTable?.innerHTML;
    const oldText = results()?.textContent;
    const oldAlert = visibleAlert();

    submitting = true;
    try {
      input.value = answer;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      button.click();

      const outcome = await waitFor(() => {
        const area = results();
        const table = area?.querySelector("#dispTable");
        if (table && (table !== oldTable || table.innerHTML !== oldRows)) {
          const capture = VerityParser.extractSearch(document, (node) => node === table && VerityParser.visible(node));
          if (capture) return { capture };
        }
        const alert = visibleAlert();
        const changedText = area?.textContent !== oldText ? area?.textContent || "" : "";
        const message = (alert !== oldAlert ? alert : "") + " " + changedText;
        if (/no (?:matching |case )?(?:records?|cases?|results?)(?: were)? found/i.test(message))
          return { message: "No matching cases found in eCourts." };
        if ((alert && alert !== oldAlert) || /invalid captcha|captcha.*(?:incorrect|invalid|mismatch)/i.test(changedText))
          throw new Error("eCourts rejected the search. Get a new CAPTCHA or open the court tab to see the message.");
        return null;
      }, 20000);
      if (!outcome) throw new Error("eCourts did not confirm the result. Check the court tab before searching again.");
      if (!outcome.capture) return outcome;
      const result = await VerityCapture.save(outcome.capture, true);
      return {
        saved: Boolean(result?.saved),
        message: result?.message || "eCourts returned cases, but Lawcovery could not confirm the save.",
      };
    } finally {
      input.value = "";
      submitting = false;
    }
  }

  async function handle({ step, value, party, year, status, challengeId, answer, previousPage }) {
    if (step === "identity") return { pageId };
    if (step === "open") {
      if (previousPage === pageId) return { loading: true };
      const hasSelection = ids.some((_, index) => {
        const value = field(index)?.value;
        return options(index).some(option => option.value === value);
      });
      if (hasSelection || document.getElementById("petres_name")?.value?.trim() ||
          document.getElementById("rgyearP")?.value?.trim() || document.querySelector("#res_party #dispTable"))
        throw new Error("The open eCourts tab already has a search on it. Reload that tab to start fresh.");

      if (selected.length || !document.getElementById("petres_name") || !options(0).length)
        throw new Error("The eCourts Party Name form is unavailable.");
      return { options: options(0) };
    }
    assertSelections();
    if (step === "refresh" || step === "submit") {
      assertPrepared();
      if (step === "refresh") return await refreshChallenge();
      return await submit(challengeId, answer);
    }
    if (step === "prepare") {
      if (selected.length !== ids.length || typeof party !== "string" ||
          party.trim().length < 3 || party.length > 99 || typeof year !== "string" || !/^\d{4}$/.test(year) ||
          !["Pending", "Disposed", "Both"].includes(status))
        throw new Error("Complete the court selections, party name, year and status.");
      const tab = document.getElementById("partyname-tabMenu");
      const nameInput = document.getElementById("petres_name");
      const yearInput = document.getElementById("rgyearP");
      const radio = document.getElementById({ Pending: "radP", Disposed: "radD", Both: "radB" }[status]);
      if (!tab || !nameInput || !yearInput || !radio)
        throw new Error("The eCourts Party Name form has changed.");
      if (tab.getAttribute("aria-selected") !== "true") tab.click();
      assertSelections();
      for (const [input, text] of [[nameInput, party.trim()], [yearInput, year]]) {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      radio.click();
      if (tab.getAttribute("aria-selected") !== "true" || nameInput.value !== party.trim() ||
          yearInput.value !== year || !radio.checked)
        throw new Error("Could not fill the Party Name form. Check the eCourts tab.");
      prepared = { tab, nameInput, yearInput, radio, party: party.trim(), year };
      return await readChallenge();
    }
    const index = selected.length;
    const select = field(index);
    if (step !== index || !select || !options(index).some((option) => option.value === value))
      throw new Error("Choose a court option from the current eCourts list.");

    // Wait for the portal to replace the dependent choices. Never return stale options.
    const next = field(index + 1);
    const oldOptions = new Set(next?.options || []);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    selected.push(value);
    if (index === ids.length - 1) {
      assertSelections();
      return {};
    }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      assertSelections();
      const current = field(index + 1);
      const choices = options(index + 1);
      const usable = [...(current?.options || [])].filter((option) => !option.disabled && option.value && option.value !== "0");
      if (choices.length && usable.every((option) => !oldOptions.has(option))) return { options: choices };
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("eCourts did not load the next court list. Start a new search or open eCourts directly.");
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== "PARTY_SEARCH_FORM") return;
    (async () => {
      try {
        respond(await handle(message));
      } catch (error) {
        respond({ error: error.message });
      }
    })();
    return true;
  });
})();
