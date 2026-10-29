(() => {
  let timer,
    previous = "",
    running = false,
    rerun = false;
  function notify(message) {
    let node = document.getElementById("verity-sync-notice");
    if (!node) {
      node = document.createElement("div");
      node.id = "verity-sync-notice";
      node.setAttribute("role", "status");
      document.body.append(node);
    }
    node.textContent = `Verity · ${message}`;
  }
  async function scan() {
    if (document.visibilityState !== "visible") return;
    if (running) {
      rerun = true;
      return;
    }
    const capture =
      VerityParser.extract(document) || VerityParser.extractSearch(document);
    if (!capture) {
      previous = "";
      return;
    }
    const signature = JSON.stringify(capture);
    if (signature === previous) return;
    running = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: "CAPTURE",
        capture: {
          ...capture,
          id: crypto.randomUUID(),
          captured_at: new Date().toISOString(),
        },
      });
      if (result?.accepted) previous = signature;
      if (result?.message) notify(result.message);
    } catch {
      notify("Extension reloaded — refresh this tab to reconnect.");
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  }
  function schedule(records) {
    if (
      records?.length &&
      records.every(
        (r) =>
          r.target.id === "verity-sync-notice" ||
          r.target.parentElement?.id === "verity-sync-notice",
      )
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(scan, 900);
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  });
  document.addEventListener("visibilitychange", schedule);
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONNECTION_CHANGED") {
      previous = "";
      schedule();
    }
  });
  schedule();
})();
