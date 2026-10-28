const source =
  "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index";
async function protectStorage() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
}
async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const data = await response.json();
  if (!response.ok) {
    const e = new Error(data.message || `Server returned ${response.status}`);
    e.permanent = response.status >= 400 && response.status < 500;
    e.auth = /Connection invalid or expired/.test(e.message);
    throw e;
  }
  return data;
}
async function wakePages() {
  for (const tab of await chrome.tabs.query({
    url: "https://services.ecourts.gov.in/ecourtindia_v6/*",
  })) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "CONNECTION_CHANGED" });
    } catch {
      /* Tab may have navigated. */
    }
  }
}
async function badge(text) {
  await chrome.action.setBadgeText({ text });
}
async function deliver(key, item, config) {
  if (item.connectionId !== config.connectionId) {
    await chrome.storage.local.remove(key);
    return { accepted: false, message: "Connection changed; reopen the case." };
  }
  try {
    const result = await rpc(config, "ingest_case_capture", {
      p_token: config.token,
      p_capture: item.capture,
    });
    await chrome.storage.local.remove(key);
    const message =
      {
        created: "Case saved",
        updated: "Case updated",
        unchanged: "Case checked · no changes",
        stale: "Older capture recorded · current details preserved",
      }[result.status] || "Case synced";
    await chrome.storage.local.set({
      lastStatus: message,
      lastSyncedAt: new Date().toISOString(),
    });
    await badge("OK");
    return { accepted: true, message };
  } catch (e) {
    if (e.auth)
      await chrome.storage.local.set({ config: { ...config, enabled: false } });
    const attempts = item.attempts + 1;
    if (e.permanent || attempts >= 3) {
      await chrome.storage.local.remove(key);
      const message = e.auth
        ? "Connection expired/revoked. Reconnect in Verity."
        : `Not saved: ${e.message}. Reopen the case after fixing the connection.`;
      await chrome.storage.local.set({ lastStatus: message });
      await badge("!");
      return { accepted: false, message };
    }
    await chrome.storage.local.set({
      [key]: { ...item, attempts },
      lastStatus: "Sync pending · automatic retry",
    });
    await chrome.alarms.create("retry", { delayInMinutes: 1 });
    await badge("…");
    return { accepted: true, message: "Sync pending · automatic retry" };
  }
}
async function handle(message, sender) {
  await protectStorage();
  const internal =
    sender.id === chrome.runtime.id &&
    !sender.tab &&
    sender.url?.startsWith(chrome.runtime.getURL(""));
  if (message.type === "CONFIGURE" && internal) {
    const cfg = message.config;
    if (
      !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url) ||
      !/^[a-f0-9]{64}$/.test(cfg.token) ||
      typeof cfg.key !== "string"
    )
      throw new Error("Invalid connection settings");
    if (!cfg.key.startsWith("sb_publishable_")) {
      try {
        if (
          JSON.parse(
            atob(cfg.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          ).role !== "anon"
        )
          throw new Error();
      } catch {
        throw new Error("Use only a Supabase publishable/anon key");
      }
    }
    const result = await rpc(cfg, "check_capture_connection", {
      p_token: cfg.token,
    });
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(
      Object.keys(all).filter((k) => k.startsWith("pending:")),
    );
    await chrome.storage.local.set({
      config: {
        ...cfg,
        connectionId: result.id,
        workspace: result.workspace,
        enabled: true,
        expiresAt: result.expires_at,
      },
      lastStatus: "Connected · automatic capture enabled",
    });
    await badge("ON");
    await wakePages();
    return { ok: true };
  }
  if (message.type === "TOGGLE" && internal) {
    const { config } = await chrome.storage.local.get("config");
    if (!config) throw new Error("Connect first");
    await chrome.storage.local.set({
      config: { ...config, enabled: !config.enabled },
    });
    await badge(config.enabled ? "OFF" : "ON");
    await wakePages();
    return { ok: true };
  }
  if (message.type === "DISCONNECT" && internal) {
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(
      Object.keys(all).filter(
        (k) => k.startsWith("pending:") || k === "config",
      ),
    );
    await badge("OFF");
    return { ok: true };
  }
  if (
    message.type === "CAPTURE" &&
    sender.id === chrome.runtime.id &&
    sender.tab &&
    sender.url?.startsWith("https://services.ecourts.gov.in/ecourtindia_v6/")
  ) {
    const { config } = await chrome.storage.local.get("config");
    if (!config?.enabled)
      return { accepted: false, message: "Auto-save paused or not connected" };
    const capture = message.capture;
    if (
      capture?.source_url !== source ||
      JSON.stringify(capture).length > 250000 ||
      !/^[A-Z]{4}\d{12}$/.test(capture.cnr)
    )
      throw new Error("Invalid case capture");
    const key = `pending:${capture.id}`;
    const all = await chrome.storage.local.get(null);
    if (Object.keys(all).filter((k) => k.startsWith("pending:")).length >= 20)
      return {
        accepted: false,
        message: "Sync queue full; check your connection",
      };
    const item = { capture, connectionId: config.connectionId, attempts: 0 };
    await chrome.storage.local.set({ [key]: item });
    return await deliver(key, item, config);
  }
  throw new Error("Unsupported request");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    try {
      const result = await navigator.locks.request("verity-sync", () =>
        handle(message, sender),
      );
      respond(result);
    } catch (e) {
      respond({ accepted: false, message: e.message, error: e.message });
    }
  })();
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "retry") return;
  (async () => {
    await navigator.locks.request("verity-sync", async () => {
      await protectStorage();
      const all = await chrome.storage.local.get(null);
      if (!all.config?.enabled) return;
      for (const [key, item] of Object.entries(all))
        if (key.startsWith("pending:")) {
          const { config } = await chrome.storage.local.get("config");
          if (!config?.enabled) break;
          await deliver(key, item, config);
        }
    });
  })().catch(async () => {
    await chrome.storage.local.set({
      lastStatus: "Retry failed. Check connection and reopen case.",
    });
  });
});
chrome.runtime.onInstalled.addListener(() => {
  protectStorage().catch(() => {});
});
