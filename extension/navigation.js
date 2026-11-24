/* Targeted navigation only: use an existing View control for one requested CNR. */
(() => {
  const valid = (cnr) =>
    typeof cnr === "string" && /^[A-Z]{4}\d{12}$/.test(cnr);
  function findLink(doc, cnr) {
    return [
      ...doc.querySelectorAll('#dispTable a[onclick*="viewHistory"]'),
    ].find(
      (a) =>
        a.getAttribute("onclick")?.match(/['"]([A-Z]{4}\d{12})['"]/)?.[1] ===
        cnr,
    );
  }
  function probe(doc, cnr, isVisible = VerityParser.visible) {
    if (!valid(cnr)) return { available: false };
    const current = VerityParser.extract(doc, isVisible);
    return {
      available: Boolean(findLink(doc, cnr) || current?.cnr === cnr),
      hasLink: Boolean(findLink(doc, cnr)),
      isCurrent: current?.cnr === cnr,
    };
  }
  async function load(
    doc,
    cnr,
    {
      force = false,
      isVisible = VerityParser.visible,
      timeoutMs = 25000,
      settleMs = 600,
    } = {},
  ) {
    if (!valid(cnr)) throw new Error("Invalid CNR");
    const current = VerityParser.extract(doc, isVisible),
      link = findLink(doc, cnr);
    if (current?.cnr === cnr && !force) return current;
    if (!link)
      throw new Error(
        "Action needed on eCourts: repeat the search containing this case, then retry from Lawcovery.",
      );
    const before = [...doc.querySelectorAll(".case_details_table")].find(
        isVisible,
      ),
      beforeText = before?.textContent;
    return await new Promise((resolve, reject) => {
      let settle, deadline;
      const observer = new MutationObserver(check);
      function finish(error, capture) {
        clearTimeout(settle);
        clearTimeout(deadline);
        observer.disconnect();
        error ? reject(error) : resolve(capture);
      }
      function check() {
        clearTimeout(settle);
        const capture = VerityParser.extract(doc, isVisible),
          table = [...doc.querySelectorAll(".case_details_table")].find(
            isVisible,
          );
        const fresh =
          !force ||
          !before?.isConnected ||
          table !== before ||
          table?.textContent !== beforeText;
        if (capture?.cnr === cnr && fresh)
          settle = setTimeout(() => {
            const latest = VerityParser.extract(doc, isVisible);
            if (latest?.cnr === cnr) finish(null, latest);
          }, settleMs);
      }
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "aria-hidden"],
      });
      deadline = setTimeout(() => {
        // Report what eCourts is showing (session expired, invalid request…).
        const shown = [...doc.querySelectorAll("#msg-danger, .alert-danger, .modal.show, .modal.in, #validateError, .errormsg")]
          .filter((el) => { try { return isVisible(el); } catch { return false; } })
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)[0];
        finish(new Error(shown
          ? `eCourts said: "${shown.slice(0, 160)}"`
          : doc.visibilityState === "hidden"
            ? "eCourts did not load this case while its tab was in the background. Keep the eCourts tab as the open tab in its own window, then resume."
            : "eCourts did not finish loading this case in time. Retry, or open the eCourts tab to see whether it shows a message."));
      }, timeoutMs);
      try {
        // viewHistory handles the AJAX load. Do not also follow the tokenised href,
        // which can reload the document and disconnect the extension response.
        link.addEventListener("click", (event) => event.preventDefault(), {
          once: true,
          capture: true,
        });
        link.click();
        check();
      } catch {
        finish(
          new Error("Unable to open the case. Reopen it on eCourts and retry."),
        );
      }
    });
  }
  globalThis.VerityNavigation = { probe, load };
})();
