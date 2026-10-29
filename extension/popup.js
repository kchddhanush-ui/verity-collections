const $ = (id) => document.getElementById(id);
async function render() {
  const { config, lastStatus, batch } = await chrome.storage.local.get([
    "config",
    "lastStatus",
    "batch",
  ]);
  $("connection").hidden = !config;
  $("setup").hidden = Boolean(config);
  if (config) {
    $("workspace").textContent = config.workspace;
    $("state").textContent = config.enabled
      ? "Automatic capture ON"
      : "Automatic capture PAUSED";
    $("toggle").textContent = config.enabled
      ? "Pause capture"
      : "Resume capture";
    $("expiry").textContent =
      `Connection expires ${new Date(config.expiresAt).toLocaleDateString()}`;
  }
  $("batch").hidden = !batch || !config;
  if (batch && config) {
    $("batch-progress").max = batch.cnrs.length;
    $("batch-progress").value = batch.index;
    $("batch-status").textContent = `${batch.index}/${batch.cnrs.length} saved · ${batch.failed.length} failed · ${batch.message}`;
    $("batch-pause").disabled = ["paused", "attention", "complete"].includes(batch.state) || !config.enabled;
    $("batch-resume").disabled = !["paused", "attention"].includes(batch.state) || !config.enabled;
  }
  $("status").textContent = lastStatus || "";
}
$("setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const cfg = JSON.parse($("settings").value);
    cfg.url = cfg.url?.replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url))
      throw new Error("A hosted Supabase project URL is required");
    const granted = await chrome.permissions.request({
      origins: [`${cfg.url}/*`],
    });
    if (!granted) throw new Error("Supabase site access was not granted");
    const result = await chrome.runtime.sendMessage({
      type: "CONFIGURE",
      config: cfg,
    });
    if (result.error) throw new Error(result.error);
    $("settings").value = "";
    await render();
  } catch (err) {
    $("status").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
for (const [id, type] of [
  ["toggle", "TOGGLE"],
  ["disconnect", "DISCONNECT"],
  ["batch-pause", "BATCH_PAUSE"],
  ["batch-resume", "BATCH_RESUME"],
])
  $(id).addEventListener("click", async () => {
    try {
      const r = await chrome.runtime.sendMessage({ type });
      if (r.error) throw new Error(r.error);
      await render();
    } catch (e) {
      $("status").textContent = e.message;
    }
  });
render().catch((e) => {
  $("status").textContent = e.message;
});

chrome.storage.onChanged.addListener(() => { render().catch(() => {}); });
