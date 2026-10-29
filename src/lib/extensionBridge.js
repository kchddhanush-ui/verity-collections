export function extensionRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(
      () => {
        window.removeEventListener("message", receive);
        reject(
          new Error(
            action === "PING"
              ? "Reload Verity Case Capture 1.3.0 and refresh this page."
              : "The extension did not finish. Check the eCourts tab and connection status before retrying.",
          ),
        );
      },
      action === "PING" ? 2000 : 120000,
    );
    function receive(event) {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.channel !== "VERITY_DASHBOARD_RESPONSE" ||
        event.data.id !== id
      )
        return;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(event.data.result);
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { channel: "VERITY_DASHBOARD_REQUEST", id, action, payload },
      window.location.origin,
    );
  });
}
