const $ = (id) => document.getElementById(id);
async function render() {
  const { config, lastStatus } = await chrome.storage.local.get([
    "config",
    "lastStatus",
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
