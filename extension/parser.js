/* Reads only the opened case section. Never copies forms, CAPTCHA, scripts or session URLs. */
(() => {
  const version = "1.0.0";
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
      "disposal date": "disposal_date",
      "nature of disposal": "nature_of_disposal",
    };
    for (const th of root.querySelectorAll(
      ".case_details_table th, .case_status_table th",
    )) {
      const label = text(th).toLowerCase();
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
  globalThis.VerityParser = { extract, visible, version };
})();
