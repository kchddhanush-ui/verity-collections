// Public navigation never takes precedence over a password-recovery link.
export function resolveEntryView(location, auth) {
  const query = new URLSearchParams(location.search || "");
  const fragment = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  if (auth.loading) return "loading";
  if (auth.recovering || query.get("mode") === "recovery" || fragment.get("type") === "recovery") {
    return auth.session ? "recovery" : "login";
  }
  if (query.get("view") === "home") return "public";
  if (auth.session) return "workspace";
  return query.get("view") === "login" ? "login" : "public";
}
