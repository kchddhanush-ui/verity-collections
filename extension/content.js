(() => {
  const searchSession = crypto.randomUUID();
  let timer,
    previous = "",
    running = false,
    rerun = false,
    targeted = false;
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
    if (targeted || document.visibilityState !== "visible") return;
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
        searchSession,
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
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === "PROBE_CASE") {
      respond(VerityNavigation.probe(document, message.cnr));
      return;
    }
    if (message.type === "LOAD_CASE") {
      if (targeted) {
        respond({ error: "Another case is loading in this court tab." });
        return;
      }
      targeted = true;
      (async () => {
        try {
          const capture = await VerityNavigation.load(document, message.cnr, {
            force: Boolean(message.force),
          });
          previous = JSON.stringify(capture);
          respond({
            capture: {
              ...capture,
              id: crypto.randomUUID(),
              captured_at: new Date().toISOString(),
            },
          });
        } catch (e) {
          respond({ error: e.message });
        } finally {
          targeted = false;
        }
      })();
      return true;
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONNECTION_CHANGED") {
      previous = "";
      schedule();
    }
  });
  // A content heartbeat drives the next item after a short delay. Durable alarms
  // provide a slower fallback when Chrome throttles hidden tabs.
  async function tickBatch() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "BATCH_TICK" });
      if (result?.batch) notify(`${result.batch.saved}/${result.batch.total} saved · ${result.batch.message}`);
    } catch { return; } // Reloading the extension requires refreshing this tab.
    setTimeout(tickBatch, 5000);
  }
  setTimeout(tickBatch, 5000);
  schedule();
})();
