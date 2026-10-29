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
    const e = new Error(
      data.message === "Unsupported parser version"
        ? "Database update required: run 202610290003_decision_date_capture.sql in Supabase, then resume the queue or reopen the case"
        : name === "get_case_capture_coverage" &&
            (response.status === 404 || data.code === "PGRST202" || data.code === "42883")
          ? "Database update required: run 202610300004_case_fetch_modes.sql in Supabase, then resume the queue"
          : data.message || `Server returned ${response.status}`,
    );
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
    if (item.capture.kind === "search_list" && item.searchSession)
      await enqueueBatch(item.capture, item.tabId, config, item.searchSession);
    await badge("OK");
    return { accepted: true, saved: true, status: result.status, message };
  } catch (e) {
    if (e.auth)
      await chrome.storage.local.set({ config: { ...config, enabled: false } });
    const attempts = item.attempts + 1;
    if (e.permanent || attempts >= 3) {
      await chrome.storage.local.remove(key);
      const message = e.auth
        ? "Connection expired/revoked. Reconnect in Lawcovery."
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
        "This release supports local Lawcovery dashboard origins only",
      );
    const result = await rpc(cfg, "check_capture_connection", {
      p_token: cfg.token,
    });
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(
      Object.keys(all).filter((k) => k.startsWith("pending:") || k === "batch"),
    );
    await chrome.storage.local.set({
      config: {
        ...cfg,
        fetchMode: cfg.fetchMode === "existing" ? "existing" : "missing",
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
  if (message.type === "BATCH_START" && internal)
    return await startBatch(message.mode);
  if (["BATCH_PAUSE", "BATCH_RESUME"].includes(message.type) && internal)
    return await controlBatch(message.type);
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
        (k) => k.startsWith("pending:") || k === "config" || k === "batch",
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
    const item = { capture, connectionId: config.connectionId, attempts: 0,
      ...(capture.kind === "search_list" ? { tabId: sender.tab.id, searchSession: message.searchSession } : {}) };
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
      "This dashboard origin is not connected. Reconnect from your Lawcovery dashboard.",
    );
  if (message.action === "PING")
    return { version: "1.4.0", connected: Boolean(config?.enabled) };
  if (!config?.enabled)
    throw new Error(
      "Extension is paused or disconnected. Connect or resume Lawcovery Case Capture.",
    );
  const p = message.payload;
  if (
    !p ||
    p.projectUrl?.replace(/\/$/, "") !== config.url ||
    typeof p.accessToken !== "string" ||
    p.accessToken.length > 12000 ||
    (!["BATCH_STATUS", "BATCH_PAUSE", "BATCH_RESUME", "BATCH_START"].includes(message.action) && !/^[A-Z]{4}\d{12}$/.test(p.cnr)) ||
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
  if (["BATCH_STATUS", "BATCH_PAUSE", "BATCH_RESUME", "BATCH_START"].includes(message.action)) {
    if (message.action !== "BATCH_STATUS")
      await navigator.locks.request("verity-sync", async () => {
        const { config: now } = await chrome.storage.local.get("config");
        if (!now?.enabled || now.connectionId !== config.connectionId)
          throw new Error("Connection changed. Retry from the connected workspace.");
        return message.action === "BATCH_START"
          ? await startBatch(p.mode)
          : await controlBatch(message.action);
      });
    const { batch } = await chrome.storage.local.get("batch");
    return { batch: batch?.connectionId === config.connectionId ? batchSummary(batch) : null };
  }
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
        message.type === "BATCH_TICK" && sender.id === chrome.runtime.id &&
        sender.tab && sender.url?.startsWith("https://services.ecourts.gov.in/ecourtindia_v6/")
          ? await runBatch(sender.tab.id)
          : message.type === "DASHBOARD"
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
  if (alarm.name === "batch") {
    runBatch().catch(() => {});
    return;
  }
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

// Only identifiers, fetch mode and progress persist; audited ingest stores snapshots.
function batchSummary(batch) {
  return {
    id: batch.id, state: batch.state, mode: batch.mode || "missing",
    sourceTotal: (batch.sourceCnrs || batch.cnrs).length,
    total: batch.cnrs.length, processed: batch.index,
    saved: batch.saved ?? batch.index, skipped: batch.skipped || 0,
    waiting: batch.cnrs.length - batch.index,
    failed: batch.failed.length, current: batch.cnrs[batch.index] || "",
    message: batch.message, updatedAt: batch.updatedAt,
  };
}
function fetchMode(mode) {
  if (!["missing", "existing"].includes(mode)) throw new Error("Choose missing or existing case details");
  return mode;
}
async function detailCoverage(config, cnrs) {
  const rows = await rpc(config, "get_case_capture_coverage", { p_token: config.token, p_cnrs: cnrs });
  // Fail closed: an unavailable or incomplete response must never fetch all cases.
  if (!Array.isArray(rows) || rows.length !== cnrs.length ||
      rows.some(row => !cnrs.includes(row.cnr) || typeof row.has_details !== "boolean") ||
      new Set(rows.map(row => row.cnr)).size !== cnrs.length)
    throw new Error("Could not verify saved case details. Nothing was fetched; retry the coverage check.");
  return new Map(rows.map(row => [row.cnr, row.has_details]));
}
async function prepareBatch(previous, config, mode) {
  fetchMode(mode);
  const sourceCnrs = previous.sourceCnrs || previous.cnrs;
  const batch = {
    id: crypto.randomUUID(), fingerprint: previous.fingerprint, tabId: previous.tabId,
    connectionId: config.connectionId, sourceCnrs, mode,
    cnrs: [], index: 0, saved: 0, skipped: 0, failed: [],
    state: "attention", needsClassification: true, nextAt: 0,
    updatedAt: new Date().toISOString(),
  };
  try {
    const coverage = await detailCoverage(config, sourceCnrs);
    batch.cnrs = sourceCnrs.filter(cnr => coverage.get(cnr) === (mode === "existing"));
    batch.needsClassification = false;
    batch.state = batch.cnrs.length ? "waiting" : "complete";
    batch.nextAt = Date.now() + 5000;
    batch.message = batch.cnrs.length
      ? `${batch.cnrs.length} ${mode === "missing" ? "cases without saved details" : "cases with saved details"} selected. Fetch starts shortly.`
      : `No ${mode === "missing" ? "missing" : "existing"} case details in this loaded search.`;
  } catch (e) {
    if (e.auth) config = { ...config, enabled: false };
    batch.message = `${e.message}. Resume queue to retry the coverage check.`;
  }
  // The selected mode also applies to subsequent source searches on this connection.
  await chrome.storage.local.set({ batch, config: { ...config, fetchMode: mode } });
  await chrome.alarms.create("batch", { periodInMinutes: 0.5 });
  return { batch: batchSummary(batch) };
}
async function enqueueBatch(capture, tabId, config, searchSession) {
  const sourceCnrs = [...new Set(capture.entries.map(e => e.cnr))]
    .filter(cnr => /^[A-Z]{4}\d{12}$/.test(cnr));
  if (!sourceCnrs.length || typeof searchSession !== "string" || searchSession.length > 100) return;
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify([searchSession, capture.entries, capture.search_context])),
  )), b => b.toString(16).padStart(2, "0")).join("");
  const { batch: old } = await chrome.storage.local.get("batch");
  if (old?.fingerprint === fingerprint && old.connectionId === config.connectionId) return;
  await prepareBatch({ sourceCnrs, fingerprint, tabId }, config, config.fetchMode || "missing");
}
// Called under the save/config lock. A non-blocking navigation lock avoids
// replacing a queue halfway through another authorised case load.
async function startBatch(mode) {
  fetchMode(mode);
  return await navigator.locks.request("verity-case-navigation", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("A case is loading. Wait for it to finish, then choose a fetch mode again.");
    const { batch, config } = await chrome.storage.local.get(["batch", "config"]);
    if (!batch || !config?.enabled || batch.connectionId !== config.connectionId)
      throw new Error("Connect/resume capture and load an eCourts search first.");
    return await prepareBatch(batch, config, mode);
  });
}
async function controlBatch(action) {
  const { batch, config } = await chrome.storage.local.get(["batch", "config"]);
  if (!batch || !config?.enabled || batch.connectionId !== config.connectionId)
    throw new Error("No active batch. Connect/resume capture and load an eCourts search first.");
  if (action === "BATCH_RESUME" && (batch.needsClassification || !batch.mode))
    return await startBatch(batch.mode || "missing");
  if (batch.state === "complete") return { batch: batchSummary(batch) };
  const paused = action === "BATCH_PAUSE";
  const next = { ...batch, state: paused ? "paused" : "waiting", nextAt: Date.now(),
    message: paused ? "Paused. An already opened case may finish saving." : "Resuming remaining cases…",
    updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ batch: next });
  if (!paused) await chrome.alarms.create("batch", { periodInMinutes: 0.5 });
  return { batch: batchSummary(next) };
}
async function runBatch(tabId) {
  return await navigator.locks.request("verity-case-navigation", { ifAvailable: true }, async lock => {
    if (!lock) return {};
    const { config, batch } = await chrome.storage.local.get(["config", "batch"]);
    if (!batch || !config?.enabled || batch.connectionId !== config.connectionId ||
        (tabId !== undefined && batch.tabId !== tabId)) return {};
    if (!batch.mode) {
      return await navigator.locks.request("verity-sync", async () => {
        const { batch: latest, config: now } = await chrome.storage.local.get(["batch", "config"]);
        if (!now?.enabled || latest?.id !== batch.id || now.connectionId !== batch.connectionId) return {};
        if (["paused", "attention"].includes(latest.state)) return { batch: batchSummary(latest) };
        return await prepareBatch(latest, now, "missing");
      });
    }
    if (["paused", "complete", "attention"].includes(batch.state) || Date.now() < batch.nextAt)
      return { batch: batchSummary(batch) };
    const cnr = batch.cnrs[batch.index];
    if (!cnr) return {};
    // Updates to the same queue are serialised with config changes and pause controls.
    async function update(fields) {
      return await navigator.locks.request("verity-sync", async () => {
        const { batch: latest, config: now } = await chrome.storage.local.get(["batch", "config"]);
        if (latest?.id !== batch.id || now?.connectionId !== batch.connectionId) return null;
        if (fields.state === "fetching" && (!now.enabled || ["paused", "attention", "complete"].includes(latest.state))) return null;
        const next = { ...latest, ...fields, updatedAt: new Date().toISOString() };
        if (latest.state === "paused" && fields.state !== "attention") next.state = "paused";
        await chrome.storage.local.set({ batch: next });
        return next;
      });
    }
    try {
      // Another user/manual capture may have saved this CNR since selection.
      const coverage = await detailCoverage(config, [cnr]);
      if (coverage.get(cnr) !== (batch.mode === "existing")) {
        const index = batch.index + 1;
        const next = await update({ index, skipped: (batch.skipped || 0) + 1,
          failed: batch.failed.filter(c => c !== cnr),
          state: index === batch.cnrs.length ? "complete" : "waiting", nextAt: Date.now() + 5000,
          message: `${cnr} skipped: it no longer matches the selected fetch mode.` });
        return { batch: next ? batchSummary(next) : null };
      }
      // A pause, replaced search or revoked connection during coverage lookup
      // must not open another source case.
      if (!await update({ state: "fetching", message: `Fetching ${cnr}…` })) return {};
      const response = await chrome.tabs.sendMessage(batch.tabId, { type: "LOAD_CASE", cnr, force: true });
      if (response?.error) throw new Error(response.error);
      if (response?.capture?.cnr !== cnr) throw new Error("Case identity mismatch. Nothing was saved.");
      const result = await navigator.locks.request("verity-sync", async () => {
        const { config: now, batch: latest } = await chrome.storage.local.get(["config", "batch"]);
        if (!now?.enabled || now.connectionId !== batch.connectionId || latest?.id !== batch.id)
          throw new Error("Capture paused or connection/search changed. Resume to retry this case.");
        return await handle({ type: "CAPTURE", capture: response.capture },
          { id: chrome.runtime.id, url: source, tab: { id: batch.tabId } });
      });
      if (!result.saved) throw new Error(result.message || "Save not confirmed. Check the connection before resuming.");
      const index = batch.index + 1;
      const next = await update({ index, saved: (batch.saved ?? batch.index) + 1,
        failed: batch.failed.filter(c => c !== cnr),
        state: index === batch.cnrs.length ? "complete" : "waiting", nextAt: Date.now() + 5000,
        message: index === batch.cnrs.length ? "Selected cases processed. Saved checks and audit history retained." : `${index} of ${batch.cnrs.length} processed. Next case shortly.` });
      return { batch: next ? batchSummary(next) : null };
    } catch (e) {
      const next = await update({ state: "attention", failed: [...new Set([...batch.failed, cnr])],
        message: `${e.message} Check eCourts/CAPTCHA and the connection, then resume.`, nextAt: 0 });
      return { batch: next ? batchSummary(next) : null };
    }
  });
}
