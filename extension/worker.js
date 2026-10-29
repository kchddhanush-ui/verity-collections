const source =
  "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index";
async function protectStorage() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
}
async function rpc(config, name, body, accessToken) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
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
    const result = await rpc(
      config,
      item.capture.kind === "search_list"
        ? "ingest_search_capture"
        : "ingest_case_capture",
      {
        p_token: config.token,
        p_capture: item.capture,
      },
    );
    await chrome.storage.local.remove(key);
    const message =
      result.status === "search_saved"
        ? `Search saved · ${result.saved_rows} cases listed${result.skipped_rows ? ` · ${result.skipped_rows} rows skipped` : ""}`
        : {
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
    return { accepted: true, saved: true, status: result.status, message };
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
    return {
      accepted: true,
      pending: true,
      message: "Sync pending · automatic retry",
    };
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
    if (
      cfg.app_origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cfg.app_origin)
    )
      throw new Error(
        "This release supports local Verity dashboard origins only",
      );
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
      new TextEncoder().encode(JSON.stringify(capture)).byteLength >
        (capture.kind === "search_list" ? 1500000 : 250000) ||
      (capture.kind === "search_list"
        ? !Array.isArray(capture.entries) || capture.entries.length > 2000
        : !/^[A-Z]{4}\d{12}$/.test(capture.cnr))
    )
      throw new Error("Invalid case capture");
    const key = `pending:${capture.id}`;
    // Bound both count and bytes of durable queues to stay within local storage quota.
    const queued = await chrome.storage.local.get(null);
    const pendingBytes = Object.entries(queued)
      .filter(([k]) => k.startsWith("pending:"))
      .reduce(
        (n, [, v]) =>
          n + new TextEncoder().encode(JSON.stringify(v)).byteLength,
        0,
      );
    if (
      pendingBytes +
        new TextEncoder().encode(JSON.stringify(capture)).byteLength >
      4000000
    )
      return {
        accepted: false,
        message:
          "Sync queue storage full; check connection before capturing another list",
      };
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
async function dashboard(message, sender) {
  await protectStorage();
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url)
    throw new Error("Invalid dashboard sender");
  const { config } = await chrome.storage.local.get("config");
  const origin = new URL(sender.url).origin;
  const allowed = config?.app_origin
    ? [config.app_origin]
    : ["http://127.0.0.1:5173", "http://localhost:5173"];
  if (!allowed.includes(origin))
    throw new Error(
      "This dashboard origin is not connected. Reconnect from your Verity dashboard.",
    );
  if (message.action === "PING")
    return { version: "1.2.1", connected: Boolean(config?.enabled) };
  if (!config?.enabled)
    throw new Error(
      "Extension is paused or disconnected. Connect or resume Verity Case Capture.",
    );
  const p = message.payload;
  if (
    !p ||
    p.projectUrl?.replace(/\/$/, "") !== config.url ||
    typeof p.accessToken !== "string" ||
    p.accessToken.length > 12000 ||
    !/^[A-Z]{4}\d{12}$/.test(p.cnr) ||
    !/^[a-f0-9-]{36}$/i.test(p.workspace)
  )
    throw new Error("Invalid dashboard case request");
  // The existing authenticated RPC returns only the caller's connections in this workspace.
  // No upload credential is exposed to the website, and no login token is persisted.
  const connections = await rpc(
    config,
    "list_capture_connections",
    { p_workspace: p.workspace },
    p.accessToken,
  );
  const connection = connections.find(
    (c) =>
      c.id === config.connectionId &&
      !c.revoked_at &&
      new Date(c.expires_at) > new Date(),
  );
  if (!connection)
    throw new Error(
      "Your dashboard account/workspace does not match the extension connection. Reconnect it to this workspace.",
    );
  const verified = await rpc(config, "check_capture_connection", {
    p_token: config.token,
  });
  if (verified.id !== config.connectionId)
    throw new Error("Connection identity changed. Reconnect the extension.");
  const tabs = await chrome.tabs.query({
    url: "https://services.ecourts.gov.in/ecourtindia_v6/*",
  });
  if (message.action === "FOCUS_COURT") {
    const { lastCourtTab } = await chrome.storage.local.get("lastCourtTab");
    const tab = tabs.find((t) => t.id === lastCourtTab) || tabs[0];
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined)
        await chrome.windows.update(tab.windowId, { focused: true });
    } else await chrome.tabs.create({ url: source, active: true });
    return { focused: true };
  }
  if (message.action !== "FETCH_CASE")
    throw new Error("Unsupported dashboard action");
  return await navigator.locks.request(
    "verity-case-navigation",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        return {
          error: "Another case is loading. Wait for it to finish, then retry.",
        };
      if (!tabs.length)
        return {
          error:
            "Action needed on eCourts: open the official portal, complete CAPTCHA and search for this case first.",
          actionNeeded: true,
        };
      const candidates = [];
      for (const tab of tabs) {
        try {
          const probe = await chrome.tabs.sendMessage(tab.id, {
            type: "PROBE_CASE",
            cnr: p.cnr,
          });
          if (probe?.available) candidates.push({ tab, probe });
        } catch {
          /* Tab may need a refresh after extension update. */
        }
      }
      const chosen = candidates.find((c) => c.probe.hasLink) || candidates[0];
      await chrome.storage.local.set({
        lastCourtTab: chosen?.tab.id || tabs[0].id,
      });
      if (!chosen)
        return {
          error:
            "Action needed on eCourts: repeat the search containing this case. If the extension was updated, refresh that tab first.",
          actionNeeded: true,
        };
      let response;
      try {
        response = await chrome.tabs.sendMessage(chosen.tab.id, {
          type: "LOAD_CASE",
          cnr: p.cnr,
          force: Boolean(p.force),
        });
      } catch {
        return {
          error:
            "eCourts tab disconnected. Refresh it, complete any CAPTCHA and retry.",
          actionNeeded: true,
        };
      }
      if (response?.error) return { error: response.error, actionNeeded: true };
      if (response?.capture?.cnr !== p.cnr)
        return {
          error: "Case identity mismatch. Nothing was saved.",
          actionNeeded: true,
        };
      return await navigator.locks.request("verity-sync", async () => {
        const { config: now } = await chrome.storage.local.get("config");
        if (!now?.enabled || now.connectionId !== config.connectionId)
          throw new Error(
            "Connection changed while the case loaded. Nothing was saved; retry with the correct workspace.",
          );
        return await handle(
          { type: "CAPTURE", capture: response.capture },
          { id: chrome.runtime.id, url: source, tab: { id: chosen.tab.id } },
        );
      });
    },
  );
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    try {
      const result =
        message.type === "DASHBOARD"
          ? await dashboard(message, sender)
          : await navigator.locks.request("verity-sync", () =>
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
