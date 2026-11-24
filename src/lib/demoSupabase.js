// Offline stand-in for the Supabase client, used only by the demo build
// (vite.demo.config.js swaps it in for ./supabase.js). It answers every query
// the app makes from demo/demo-data.json and never contacts a server.
import demo from "../../demo/demo-data.json";

export const configurationError = "";

const tables = { workspaces: demo.workspaces, ...demo.tables };
const SESSION_KEY = "lawcovery-demo-session";
const demoUser = (email) => ({
  id: "demo-user",
  email: email || demo.user?.email || "demo@lawcovery.app",
  user_metadata: { full_name: demo.user?.name || "" },
});

let session = null;
try { session = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}
const listeners = new Set();
function setSession(next, event) {
  session = next;
  try {
    if (next) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  listeners.forEach((cb) => cb(event, session));
}

const ok = (data) => Promise.resolve({ data, error: null });
const disabled = (what) => Promise.resolve({ data: null, error: { code: "DEMO", message: `${what} is not available in this demo. Nothing was changed.` } });

// Minimal, chainable, awaitable query builder covering the calls the app uses.
function query(table) {
  let rows = [...(tables[table] || [])];
  let single = false;
  const builder = {
    select: () => builder,
    eq: (column, value) => { rows = rows.filter((row) => row[column] === value); return builder; },
    in: (column, values) => { rows = rows.filter((row) => values.includes(row[column])); return builder; },
    order: (column, { ascending = true } = {}) => {
      rows.sort((a, b) => {
        const x = a[column], y = b[column];
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      });
      return builder;
    },
    limit: (n) => { rows = rows.slice(0, n); return builder; },
    range: (from, to) => { rows = rows.slice(from, to + 1); return builder; },
    single: () => { single = true; return builder; },
    maybeSingle: () => { single = true; return builder; },
    insert: () => disabled("Saving"),
    update: () => disabled("Saving"),
    upsert: () => disabled("Saving"),
    delete: () => disabled("Deleting"),
    then: (resolve, reject) => ok(single ? rows[0] ?? null : rows).then(resolve, reject),
  };
  return builder;
}

export const supabase = {
  auth: {
    getSession: () => ok({ session }),
    onAuthStateChange(cb) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signInWithPassword({ email }) {
      const next = { access_token: "demo", token_type: "bearer", user: demoUser(email) };
      setSession(next, "SIGNED_IN");
      return ok({ session: next, user: next.user });
    },
    signOut() { setSession(null, "SIGNED_OUT"); return ok({}); },
    resetPasswordForEmail: () => ok({}),
    updateUser: () => ok({ user: session?.user ?? null }),
  },
  from: (table) => query(table),
  rpc(name) {
    switch (name) {
      case "list_capture_connections": return ok([]);
      case "revoke_my_capture_connections": return ok(null);
      case "submit_access_request": return ok(null);
      case "import_loan_data": return disabled("Importing loan data");
      case "create_workspace": return disabled("Creating a workspace");
      case "delete_workspace": return disabled("Deleting a workspace");
      default: return disabled("This action");
    }
  },
};

// A small, dismissible ribbon so viewers know this is a snapshot.
if (typeof document !== "undefined") {
  const add = () => {
    if (document.getElementById("demo-ribbon")) return;
    const ribbon = document.createElement("div");
    ribbon.id = "demo-ribbon";
    ribbon.setAttribute("role", "note");
    const when = demo.exportedAt ? new Date(demo.exportedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    ribbon.innerHTML = `<strong>Demo</strong><span>Data as of ${when}. Sign in with any email and password. Changes are not saved.</span><button type="button" aria-label="Hide demo notice">×</button>`;
    ribbon.querySelector("button").onclick = () => ribbon.remove();
    Object.assign(ribbon.style, {
      position: "fixed", insetInlineStart: "50%", insetBlockEnd: "16px", transform: "translateX(-50%)", zIndex: "9999",
      display: "flex", alignItems: "center", gap: "10px", padding: "8px 8px 8px 14px", borderRadius: "999px",
      background: "#0f2447", color: "#fff", font: "600 13px 'DM Sans', system-ui, sans-serif", boxShadow: "0 12px 30px rgba(15,36,71,.3)",
      maxInlineSize: "calc(100vw - 32px)",
    });
    const strong = ribbon.querySelector("strong");
    Object.assign(strong.style, { padding: "2px 8px", borderRadius: "999px", background: "#1d4ed8", fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase" });
    Object.assign(ribbon.querySelector("button").style, { border: "0", background: "rgba(255,255,255,.14)", color: "#fff", inlineSize: "24px", blockSize: "24px", borderRadius: "50%", cursor: "pointer", fontSize: "16px", lineHeight: "1" });
    document.body.append(ribbon);
  };
  if (document.body) add(); else window.addEventListener("DOMContentLoaded", add);
}
