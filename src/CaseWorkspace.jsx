import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./workspace.css";

const date = (value) => (value ? new Date(value).toLocaleString() : "—");
const show = (value) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
const labels = {
  case_type: "Case type",
  filing_number: "Filing number",
  filing_date: "Filing date",
  registration_number: "Case number",
  registration_date: "Registration date",
  first_hearing_date: "First hearing",
  next_hearing_date: "Next hearing",
  case_stage: "Stage",
  court: "Court",
  court_number_judge: "Court number / judge",
  case_status: "Status",
  disposal_date: "Disposal date",
  nature_of_disposal: "Nature of disposal",
  petitioners: "Petitioners / advocates",
  respondents: "Respondents / advocates",
  acts: "Acts / sections",
  processes: "Processes",
  history: "Hearing history",
  orders: "Orders",
};
async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
function Table({ headers, rows, label }) {
  return (
    <div
      className="case-table-wrap"
      tabIndex="0"
      role="region"
      aria-label={label}
    >
      <table className="case-table">
        <caption>{label}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CaseWorkspace({ session, onSignOut, pending }) {
  const [workspaces, setWorkspaces] = useState([]),
    [workspace, setWorkspace] = useState(""),
    [cases, setCases] = useState([]),
    [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState(null),
    [audits, setAudits] = useState([]),
    [captures, setCaptures] = useState([]),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("details");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [settings, setSettings] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("workspaces")
          .select("id,name")
          .order("created_at");
        if (e) throw e;
        if (active) {
          setWorkspaces(data);
          setWorkspace(data[0]?.id || "");
        }
      } catch (e) {
        if (active)
          setError(
            `Database setup required: ${e.message}. Follow docs/SETUP.md and run the migration in Supabase.`,
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    if (!workspace) return;
    const [cr, conn] = await Promise.all([
      supabase
        .from("court_cases")
        .select("*")
        .eq("workspace_id", workspace)
        .order("last_checked_at", { ascending: false })
        .limit(1000),
      call("list_capture_connections", { p_workspace: workspace }),
    ]);
    if (cr.error) throw cr.error;
    setCases(cr.data);
    setConnections(conn);
    setSelected((old) =>
      old ? cr.data.find((c) => c.id === old.id) || null : null,
    );
  }
  useEffect(() => {
    let active = true;
    setCases([]);
    setSelected(null);
    setSettings("");
    setNotice("");
    setConnections([]);
    if (!workspace) return;
    setBusy(true);
    (async () => {
      try {
        const [cr, conn] = await Promise.all([
          supabase
            .from("court_cases")
            .select("*")
            .eq("workspace_id", workspace)
            .order("last_checked_at", { ascending: false })
            .limit(1000),
          call("list_capture_connections", { p_workspace: workspace }),
        ]);
        if (cr.error) throw cr.error;
        if (active) {
          setCases(cr.data);
          setConnections(conn);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspace]);
  useEffect(() => {
    let active = true;
    setAudits([]);
    setCaptures([]);
    if (!selected) return;
    (async () => {
      try {
        const [a, c] = await Promise.all([
          supabase
            .from("case_audit")
            .select("*")
            .eq("case_id", selected.id)
            .order("occurred_at", { ascending: false })
            .limit(100),
          supabase
            .from("case_captures")
            .select(
              "id,captured_by,captured_at,received_at,outcome,source_url,snapshot",
            )
            .eq("case_id", selected.id)
            .order("received_at", { ascending: false })
            .limit(100),
        ]);
        if (a.error || c.error) throw a.error || c.error;
        if (active) {
          setAudits(a.data);
          setCaptures(c.data);
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [selected]);
  async function perform(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function createWorkspace(e) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    await perform(async () => {
      const id = await call("create_workspace", { p_name: name });
      setWorkspaces((old) => [...old, { id, name }]);
      setWorkspace(id);
    });
  }
  async function connect() {
    await perform(async () => {
      const result = await call("create_capture_connection", {
        p_workspace: workspace,
        p_label: "Chrome desktop",
      });
      setSettings(
        JSON.stringify(
          {
            url: import.meta.env.VITE_SUPABASE_URL,
            key:
              import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
              import.meta.env.VITE_SUPABASE_ANON_KEY,
            token: result.token,
          },
          null,
          2,
        ),
      );
      setNotice(
        "Copy these settings into the extension. The secret is shown only now; it expires in 30 days.",
      );
      await refresh();
    });
  }
  const filtered = cases.filter((c) =>
    JSON.stringify([c.cnr, c.data]).toLowerCase().includes(query.toLowerCase()),
  );
  const totals = [
    ["Captured cases", cases.length],
    ["Pending", cases.filter((c) => c.data.case_status === "Pending").length],
    ["Disposed", cases.filter((c) => c.data.case_status === "Disposed").length],
    [
      "Status unknown",
      cases.filter((c) => !["Pending", "Disposed"].includes(c.data.case_status))
        .length,
    ],
  ];
  return (
    <div className="verity-console">
      <header className="console-header">
        <a className="console-brand" href="/">
          verity<span>.</span>
        </a>
        <span>{session.user.email}</span>
        <button disabled={pending || busy} onClick={onSignOut}>
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </header>
      <main className="console-main">
        <div className="console-title">
          <div>
            <p className="console-eyebrow">
              LEGAL COLLECTIONS · CASE INTELLIGENCE
            </p>
            <h1>Your case portfolio.</h1>
            <p>
              Latest captured details, with every change recorded separately.
            </p>
          </div>
          <a
            className="console-link"
            href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index"
            target="_blank"
            rel="noreferrer"
          >
            Open eCourts ↗
          </a>
        </div>
        {error && (
          <div className="console-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status">Loading workspaces…</p>
        ) : (
          <>
            <div className="console-toolbar">
              <label>
                Company workspace{" "}
                <select
                  disabled={busy}
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                >
                  {!workspace && <option value="">Select a workspace</option>}
                  {workspaces.map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!workspace || busy}
                onClick={() => perform(refresh)}
              >
                {busy ? "Loading…" : "Refresh cases"}
              </button>
            </div>
            <details className="console-panel" open={!workspaces.length}>
              <summary>Create a company workspace</summary>
              <form className="inline-form" onSubmit={createWorkspace}>
                <label>
                  Company name
                  <input
                    name="name"
                    required
                    maxLength="120"
                    placeholder="Your company"
                  />
                </label>
                <button disabled={busy}>Create workspace</button>
              </form>
              <p>
                Only workspace members can see its records. Add teammates using
                the administrator SQL in the setup guide.
              </p>
            </details>
            {workspace && (
              <>
                <div className="console-metrics">
                  {totals.map(([label, count]) => (
                    <article key={label}>
                      <span>{label}</span>
                      <strong>{count}</strong>
                      <small>From saved cases in this workspace</small>
                    </article>
                  ))}
                </div>
                <details className="console-panel">
                  <summary>Connect Chrome for automatic capture</summary>
                  <p>
                    Install the extension from this repository’s{" "}
                    <code>extension</code> folder, then connect it once. Opening
                    an eCourts case will save its loaded details automatically.
                  </p>
                  <p>
                    Connections stay active until paused, revoked, expired, or
                    you sign out of Verity. Each upload is attributed to the
                    account that created the connection.
                  </p>
                  <button disabled={busy} onClick={connect}>
                    Create extension connection
                  </button>
                  {settings && (
                    <div>
                      <p role="status">{notice}</p>
                      <label>
                        Private connection settings
                        <textarea
                          readOnly
                          value={settings}
                          rows="7"
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <button
                        onClick={() =>
                          perform(async () => {
                            await navigator.clipboard.writeText(settings);
                            setNotice(
                              "Connection settings copied. Paste them in the extension.",
                            );
                          })
                        }
                      >
                        Copy settings
                      </button>
                      <button onClick={() => setSettings("")}>
                        Hide secret
                      </button>
                    </div>
                  )}
                  <ul className="connection-list">
                    {connections.map((c) => (
                      <li key={c.id}>
                        <span>
                          {c.label} ·{" "}
                          {c.revoked_at
                            ? "Revoked"
                            : new Date(c.expires_at) < new Date()
                              ? "Expired"
                              : `Expires ${date(c.expires_at)}`}
                        </span>
                        {!c.revoked_at && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              perform(async () => {
                                await call("revoke_capture_connection", {
                                  p_id: c.id,
                                });
                                setSettings("");
                                await refresh();
                              })
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
                <section className="console-panel">
                  <div className="section-heading">
                    <h2>Cases</h2>
                    <label>
                      Search cases
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="CNR, party, court or stage"
                      />
                    </label>
                  </div>
                  <p className="muted">
                    {filtered.length} matching of {cases.length} loaded cases ·
                    up to 1,000 most recently checked cases. Counts describe
                    your captured portfolio, not all court cases. Use Refresh
                    cases after capture.
                  </p>
                  {filtered.length ? (
                    <Table
                      label="Saved court cases"
                      headers={[
                        "Case / CNR",
                        "Parties",
                        "Stage / status",
                        "Next hearing",
                        "Last checked",
                      ]}
                      rows={filtered.map((c) => [
                        <button
                          className="case-open"
                          onClick={() => {
                            setSelected(c);
                            setTab("details");
                          }}
                        >
                          {c.data.registration_number}
                          <small>{c.cnr}</small>
                        </button>,
                        <>
                          {c.data.petitioners?.join("; ")}
                          <small>vs {c.data.respondents?.join("; ")}</small>
                        </>,
                        <>
                          {c.data.case_stage || "—"}
                          <small>{c.data.case_status || "Unknown"}</small>
                        </>,
                        c.data.next_hearing_date || "—",
                        date(c.last_checked_at),
                      ])}
                    />
                  ) : (
                    <div className="console-empty">
                      <h3>
                        {query ? "No matching cases" : "No cases captured yet"}
                      </h3>
                      <p>
                        Connect the extension, complete CAPTCHA on eCourts, and
                        open a case. Then refresh this list.
                      </p>
                    </div>
                  )}
                </section>
                {selected && (
                  <section className="console-panel" aria-label="Selected case">
                    <div className="section-heading">
                      <div>
                        <p className="console-eyebrow">{selected.cnr}</p>
                        <h2>{selected.data.registration_number}</h2>
                      </div>
                      <button onClick={() => setSelected(null)}>
                        Close details
                      </button>
                    </div>
                    <nav className="case-tabs" aria-label="Case views">
                      {[
                        ["details", "Current details"],
                        ["audit", "Audit history"],
                        ["captures", "Capture checks"],
                      ].map(([key, label]) => (
                        <button
                          aria-pressed={tab === key}
                          onClick={() => setTab(key)}
                          key={key}
                        >
                          {label}
                        </button>
                      ))}
                    </nav>
                    {tab === "details" && (
                      <>
                        <dl className="case-facts">
                          {Object.entries(selected.data)
                            .filter(([, v]) => !Array.isArray(v))
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{labels[k] || k}</dt>
                                <dd>{show(v)}</dd>
                              </div>
                            ))}
                        </dl>
                        {Object.entries(selected.data)
                          .filter(([, v]) => Array.isArray(v))
                          .map(([k, values]) => (
                            <div key={k}>
                              <h3>{labels[k] || k}</h3>
                              {Array.isArray(values[0]) ? (
                                <Table
                                  label={labels[k] || k}
                                  headers={
                                    k === "history"
                                      ? [
                                          "Judge",
                                          "Business on",
                                          "Hearing date",
                                          "Purpose",
                                        ]
                                      : k === "processes"
                                        ? ["Process ID", "Title", "Date"]
                                        : k === "acts"
                                          ? ["Act", "Section"]
                                          : ["Details"]
                                  }
                                  rows={values}
                                />
                              ) : (
                                <ul>
                                  {values.map((v, i) => (
                                    <li key={i}>{show(v)}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                      </>
                    )}
                    {tab === "audit" && (
                      <>
                        <p>
                          Automatic updates only. Previous and new values are
                          preserved; there is no approval workflow. Showing up
                          to 100 latest events.
                        </p>
                        {!audits.length && <p>No change events found.</p>}
                        {audits.map((a) => (
                          <article className="audit-event" key={a.id}>
                            <h3>
                              {a.action === "created"
                                ? "Case created"
                                : "Case updated"}{" "}
                              · {date(a.occurred_at)}
                            </h3>
                            <p>
                              Captured by user {a.actor_id} · Capture{" "}
                              {a.capture_id}
                            </p>
                            <Table
                              label="Recorded field changes"
                              headers={["Field", "Previous value", "New value"]}
                              rows={Object.entries(a.changes).map(([k, v]) => [
                                labels[k] || k,
                                show(v.old),
                                show(v.new),
                              ])}
                            />
                          </article>
                        ))}
                      </>
                    )}
                    {tab === "captures" && (
                      <>
                        <p>
                          Up to 100 latest checks, including unchanged and older
                          captures. Snapshots contain extracted fields, not the
                          full court webpage.
                        </p>
                        {captures.map((c) => (
                          <details className="capture-entry" key={c.id}>
                            <summary>
                              {date(c.received_at)} · {c.outcome}
                            </summary>
                            <p>
                              Observed {date(c.captured_at)} · User{" "}
                              {c.captured_by}
                            </p>
                            <a
                              href={c.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Official source ↗
                            </a>
                            <pre>{JSON.stringify(c.snapshot, null, 2)}</pre>
                          </details>
                        ))}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        <footer className="console-footer">
          Source: eCourts Services · Details reflect the last captured page.
          Verify important information with the court record.
        </footer>
      </main>
    </div>
  );
}
