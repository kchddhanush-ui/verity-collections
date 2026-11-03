// Only the Party Name form is exposed. The portal owns submission and CAPTCHA.
(() => {
  const ids = ["sess_state_code", "sess_dist_code", "court_complex_code", "court_est_code"];
  const selected = [];
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

  async function handle({ step, value, party, year, status }) {
    if (step === "open") {
      if (selected.length || !document.getElementById("petres_name") || !options(0).length)
        throw new Error("The eCourts Party Name form is unavailable.");
      return { options: options(0) };
    }
    assertSelections();
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
      return { ready: true };
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
