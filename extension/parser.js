/* Reads only the opened case section. Never copies forms, CAPTCHA, scripts or session URLs. */
(() => {
  const version = "1.1.0";
  const searchVersion = "1.0.0";
  const source =
    "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index";
  const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  function visible(node) {
    if (!node?.isConnected) return false;
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      const style = el.ownerDocument.defaultView?.getComputedStyle?.(el);
      if (
        el.hidden ||
        el.getAttribute("aria-hidden") === "true" ||
        style?.display === "none" ||
        style?.visibility === "hidden"
      )
        return false;
    }
    return Boolean(node.getClientRects?.().length);
  }
  function rows(root, selector) {
    return [...root.querySelectorAll(`${selector} tr`)]
      .map((tr) => [...tr.querySelectorAll("td")].map(text))
      .filter((r) => r.length);
  }
  function extract(doc, isVisible = visible) {
    const tables = [...doc.querySelectorAll(".case_details_table")].filter(
      isVisible,
    );
    if (tables.length !== 1) return null;
    const table = tables[0];
    const root = table.parentElement;
    const data = {};
    const fields = {
      "case type": "case_type",
      "filing number": "filing_number",
      "filing date": "filing_date",
      "registration number": "registration_number",
      "registration date": "registration_date",
      "first hearing date": "first_hearing_date",
      "next hearing date": "next_hearing_date",
      "case stage": "case_stage",
      "court number and judge": "court_number_judge",
      "case status": "case_status",
      "decision date": "decision_date",
      "disposal date": "disposal_date",
      "nature of disposal": "nature_of_disposal",
    };
    for (const th of root.querySelectorAll(
      ".case_details_table th, .case_status_table th",
    )) {
      const label = text(th)
        .toLowerCase()
        .replace(/\s*:\s*$/, "")
        .trim();
      const field = fields[label];
      const td = th.nextElementSibling;
      if (field && td?.tagName === "TD" && text(td) && text(td) !== "-")
        data[field] = text(td);
    }
    const cnrCell = [...table.querySelectorAll("th")].find(
      (th) => text(th).toLowerCase() === "cnr number",
    )?.nextElementSibling;
    const cnr = text(cnrCell).match(/\b[A-Z]{4}\d{12}\b/)?.[0];
    data.court = text(root.querySelector("#chHeading, h2"));
    for (const [key, selector] of [
      ["petitioners", ".Petitioner_Advocate_table li"],
      ["respondents", ".Respondent_Advocate_table li"],
    ]) {
      const values = [...root.querySelectorAll(selector)]
        .map(text)
        .filter(Boolean);
      if (values.length) data[key] = values;
    }
    for (const [key, selector] of [
      ["acts", ".acts_table"],
      ["processes", "#process"],
      ["history", ".history_table"],
      ["orders", ".order_table, .orders_table"],
    ]) {
      const values = rows(root, selector);
      if (values.length) data[key] = values;
    }
    // Status is explicit in some layouts, otherwise read the case's own business links.
    const statusLink =
      root
        .querySelector('.history_table a[onclick*="viewBusiness"]')
        ?.getAttribute("onclick") || "";
    if (!data.case_status && /['"]Disposed['"]/.test(statusLink))
      data.case_status = "Disposed";
    else if (!data.case_status && /['"]Pending['"]/.test(statusLink))
      data.case_status = "Pending";
    if (
      !cnr ||
      !data.registration_number ||
      !data.court ||
      (!data.case_stage && !data.case_status)
    )
      return null;
    return { cnr, data, source_url: source, parser_version: version };
  }
  function extractSearch(doc, isVisible = visible) {
    const tables = [...doc.querySelectorAll("#dispTable")].filter(isVisible);
    if (tables.length !== 1) return null;
    const table = tables[0],
      root = table.parentElement;
    const summary = text(root.querySelector("#courtSummary"));
    const total = summary.match(/Total number of cases\s*:\s*([\d,]+)/i);
    const establishments = summary.match(
      /Total Number of Establishments in Court Complex\s*:\s*([\d,]+)/i,
    );
    if (!total) return null;
    let court = "",
      loaded = 0,
      skipped = 0;
    const entries = [],
      seen = new Set();
    for (const row of table.querySelectorAll("tbody tr")) {
      const heading = row.querySelector('th[id^="td_court_name_"]');
      if (heading) {
        court = text(heading);
        continue;
      }
      const cells = [...row.children].filter((el) => el.tagName === "TD");
      if (cells.length < 3) continue;
      loaded++;
      const cnr = row
        .querySelector('a[onclick*="viewHistory"]')
        ?.getAttribute("onclick")
        ?.match(/['"]([A-Z]{4}\d{12})['"]/)?.[1];
      const reference = text(cells[1]),
        parts = reference.match(/^(.*?)\/(\d+)\/(\d{4})$/);
      if (!cnr || !parts || !court || seen.has(cnr)) {
        skipped++;
        continue;
      }
      seen.add(cnr);
      const partyLines = [...cells[2].childNodes]
        .map((node) => (node.nodeName === "BR" ? "\n" : node.textContent))
        .join("");
      const parties = partyLines.split(/\n\s*(?:vs\.?|versus)\s*\n/i);
      const data = {
        serial_number: text(cells[0]),
        case_reference: reference,
        case_type: parts[1],
        registration_number: `${parts[2]}/${parts[3]}`,
        court,
        parties_text: text(cells[2]),
      };
      if (parties.length === 2) {
        data.petitioners = [parties[0].trim()];
        data.respondents = [parties[1].trim()];
      }
      entries.push({ cnr, data });
    }
    if (!entries.length) return null;
    // Only these selected labels and party-search fields are collected; never copy arbitrary forms/CAPTCHA.
    const selectedText = (id) => {
      const el = doc.getElementById(id);
      return text(
        el?.selectedOptions?.[0] || el?.querySelector("option[selected]"),
      );
    };
    const search_context = {
      state: selectedText("sess_state_code"),
      district: selectedText("sess_dist_code"),
      court_complex: selectedText("court_complex_code"),
      establishment: selectedText("court_est_code"),
    };
    if (root.closest("#partyName") || root.id === "res_party") {
      search_context.search_type = "Party name";
      search_context.party_name =
        doc.getElementById("petres_name")?.value || "";
      search_context.registration_year =
        doc.getElementById("rgyearP")?.value || "";
      search_context.status_filter =
        doc.querySelector('#frmsearch_name input[name="case_status"]:checked')
          ?.value || "";
    }
    const court_totals = [
      ...root.querySelectorAll('a[href*="#td_court_name_"]'),
    ]
      .map((a) => {
        const match = text(a).match(/^(.*):\s*([\d,]+)$/);
        return match
          ? {
              court: match[1].trim(),
              reported_cases: Number(match[2].replaceAll(",", "")),
            }
          : null;
      })
      .filter(Boolean);
    return {
      kind: "search_list",
      source_url: source,
      parser_version: searchVersion,
      search_context,
      reported_cases: Number(total[1].replaceAll(",", "")),
      total_establishments: establishments
        ? Number(establishments[1].replaceAll(",", ""))
        : null,
      court_totals,
      loaded_rows: loaded,
      skipped_rows: skipped,
      entries,
    };
  }
  globalThis.VerityParser = { extract, extractSearch, visible, version };
})();
