// Dashboard bridge. Relays permitted actions to the extension for the connected Lawcovery tab.
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== "VERITY_DASHBOARD_REQUEST"
  )
    return;
  const { id, action, payload } = event.data;
  if (
    typeof id !== "string" ||
    !["AUTO_CONNECT", "RELEASE_CONNECTION", "PING", "FETCH_CASE", "FOCUS_COURT", "BATCH_STATUS", "BATCH_PAUSE", "BATCH_RESUME", "BATCH_START", "PARTY_SEARCH"].includes(action)
  )
    return;
  (async () => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "DASHBOARD",
        action,
        payload,
      });
      window.postMessage(
        { channel: "VERITY_DASHBOARD_RESPONSE", id, result },
        location.origin,
      );
    } catch {
      window.postMessage(
        {
          channel: "VERITY_DASHBOARD_RESPONSE",
          id,
          result: {
            error:
              "Extension unavailable. Reload the extension and refresh Lawcovery.",
          },
        },
        location.origin,
      );
    }
  })();
});
