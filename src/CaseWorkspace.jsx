import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./workspace.css";
import { mergePortfolio } from "./lib/portfolio";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { HearingCalendar } from "./components/HearingCalendar";
import { extensionRequest } from "./lib/extensionBridge";

const AnalyticsDashboard = lazy(() =>
  import("./components/AnalyticsDashboard").then((module) => ({
    default: module.AnalyticsDashboard,
  })),
);

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
  decision_date: "Decision Date",
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
function Table({ headers, rows, label, caseList = false }) {
  return (
    <div
      className={`case-table-wrap ${caseList ? "portfolio-table-wrap" : ""}`}
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
              {r.map((v, j) =>
                caseList && j === 0 ? (
                  <th scope="row" key={j}>
                    {v}
                  </th>
                ) : (
                  <td key={j} data-label={headers[j]}>
                    {caseList ? (
                      <span className="table-cell-content">{v}</span>
                    ) : (
                      v
                    )}
                  </td>
                ),
              )}
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
  const caseDialog = useRef(null);
  const viewOpen = useRef(false);
  const requestedCnr = useRef("");
  const [fetching, setFetching] = useState("");
  const [fetchStatus, setFetchStatus] = useState(null);
  const [batch, setBatch] = useState(null);
  const [batchError, setBatchError] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [searches, setSearches] = useState([]);
  const [portfolioView, setPortfolioView] = useState("overview");
  const [listingAudits, setListingAudits] = useState([]);
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
  async function loadPortfolio(target) {
    const [details, listings, searches, connections] = await Promise.all([
      supabase
        .from("court_cases")
        .select("*")
        .eq("workspace_id", target)
        .order("last_checked_at", { ascending: false })
        .limit(1000),
      supabase
        .from("case_listings")
        .select("*")
        .eq("workspace_id", target)
        .order("last_seen_at", { ascending: false })
        .limit(1000),
      supabase
        .from("court_search_captures")
        .select(
          "id,captured_at,received_at,search_context,total_establishments,reported_cases,court_totals,loaded_rows,skipped_rows",
        )
        .eq("workspace_id", target)
        .order("captured_at", { ascending: false })
        .limit(10),
      call("list_capture_connections", { p_workspace: target }),
    ]);
    if (details.error || listings.error || searches.error)
      throw new Error(
        (details.error || listings.error || searches.error).message +
          ". If the search tables are missing, run migration 202610290002_search_result_capture.sql once.",
      );
    return {
      cases: mergePortfolio(details.data, listings.data),
      searches: searches.data,
      connections,
    };
  }
  async function refresh() {
    if (!workspace) return;
    const result = await loadPortfolio(workspace);
    setCases(result.cases);
    setConnections(result.connections);
    setSearches(result.searches);
    setSelected((old) =>
      old ? result.cases.find((c) => c.cnr === old.cnr) || null : null,
    );
  }
  useEffect(() => {
    let active = true;
    setCases([]);
    setSearches([]);
    setFetchStatus(null);
    setSelected(null);
    setSettings("");
    setNotice("");
    setConnections([]);
    if (!workspace) return;
    setBusy(true);
    (async () => {
      try {
        const result = await loadPortfolio(workspace);
        if (active) {
          setCases(result.cases);
          setConnections(result.connections);
          setSearches(result.searches);
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
    setListingAudits([]);
    if (!selected) return;
    (async () => {
      try {
        const [a, c, la] = await Promise.all([
          selected.hasDetails
            ? supabase
                .from("case_audit")
                .select("*")
                .eq("case_id", selected.id)
                .order("occurred_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] }),
          selected.hasDetails
            ? supabase
                .from("case_captures")
                .select(
                  "id,captured_by,captured_at,received_at,outcome,source_url,snapshot",
                )
                .eq("case_id", selected.id)
                .order("received_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] }),
          supabase
            .from("listing_audit")
            .select("*")
            .eq("workspace_id", workspace)
            .eq("cnr", selected.cnr)
            .order("occurred_at", { ascending: false })
            .limit(100),
        ]);
        if (a.error || c.error || la.error)
          throw a.error || c.error || la.error;
        if (active) {
          setListingAudits(la.data);
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
  }, [selected, workspace]);
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
            app_origin: window.location.origin,
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
  function dashboardPayload(cnr) {
    return {
      cnr,
      workspace,
      projectUrl: import.meta.env.VITE_SUPABASE_URL?.trim(),
      accessToken: session.access_token,
    };
  }
  useEffect(() => {
    let active = true,
      timer,
      lastProgress = "";
    setBatch(null);
    setBatchError("");
    if (!workspace || !session.access_token) return;
    async function poll() {
      try {
        const ping = await extensionRequest("PING");
        if (ping?.connected) {
          const result = await extensionRequest(
            "BATCH_STATUS",
            dashboardPayload(),
          );
          if (active && !result.error) {
            setBatch(result.batch || null);
            const progress = result.batch
              ? `${result.batch.id}:${result.batch.saved}:${result.batch.processed ?? result.batch.saved}:${result.batch.skipped || 0}`
              : "";
            if (progress && progress !== lastProgress) {
              const portfolio = await loadPortfolio(workspace);
              if (active) {
                setCases(portfolio.cases);
                setSearches(portfolio.searches);
                setConnections(portfolio.connections);
                setSelected((old) =>
                  old
                    ? portfolio.cases.find((c) => c.cnr === old.cnr) || old
                    : null,
                );
                lastProgress = progress;
              }
            }
          } else if (active) setBatch(null);
        } else if (active) setBatch(null);
      } catch {
        /* An uninstalled/disconnected extension does not block saved cases. */
      } finally {
        if (active) timer = setTimeout(poll, 6000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspace, session.access_token]);
  async function batchControl(action, mode) {
    setBatchError("");
    setBatchBusy(true);
    try {
      const result = await extensionRequest(action, { ...dashboardPayload(), ...(mode ? { mode } : {}) });
      if (result.error) throw new Error(result.error);
      setBatch(result.batch || null);
    } catch (e) {
      setBatchError(e.message);
    } finally {
      setBatchBusy(false);
    }
  }
  useEffect(() => {
    if (selected && caseDialog.current && !caseDialog.current.open) {
      caseDialog.current.showModal();
      caseDialog.current.querySelector("#selected-case-heading")?.focus();
    }
  }, [selected?.cnr]);
  function closeCase() {
    viewOpen.current = false;
    caseDialog.current?.close();
    setSelected(null);
  }
  function openSavedCase(item) {
    viewOpen.current = true;
    requestedCnr.current = item.cnr;
    setSelected(item);
    setTab("details");
    setFetchStatus(null);
  }
  async function fetchCase(item) {
    viewOpen.current = true;
    requestedCnr.current = item.cnr;
    setSelected(item);
    setTab("details");
    if (fetching || busy) return;
    setFetching(item.cnr);
    setBusy(true);
    setFetchStatus({
      message: `Fetching details for ${item.cnr} through your eCourts tab…`,
    });
    try {
      const ping = await extensionRequest("PING");
      if (ping?.error) throw new Error(ping.error);
      if (!ping?.connected)
        throw new Error("Connect or resume Lawcovery Case Capture first.");
      const result = await extensionRequest("FETCH_CASE", {
        ...dashboardPayload(item.cnr),
        force: true,
      });
      if (result?.error) {
        setFetchStatus({
          message: result.error,
          actionNeeded: result.actionNeeded,
        });
        return;
      }
      if (!result?.saved) {
        setFetchStatus({
          message:
            result?.message ||
            "Upload pending. Check the extension status, then refresh cases after it syncs.",
        });
        return;
      }
      const portfolio = await loadPortfolio(workspace);
      setCases(portfolio.cases);
      setSearches(portfolio.searches);
      setConnections(portfolio.connections);
      if (viewOpen.current && requestedCnr.current === item.cnr)
        setSelected(portfolio.cases.find((c) => c.cnr === item.cnr) || item);
      setFetchStatus({
        message: `${result.message}. Details and audit history refreshed.`,
      });
    } catch (e) {
      setFetchStatus({ message: e.message, actionNeeded: true });
    } finally {
      setFetching("");
      setBusy(false);
    }
  }
  async function focusCourt() {
    const cnr = selected?.cnr || requestedCnr.current;
    if (!cnr) return;
    try {
      const result = await extensionRequest(
        "FOCUS_COURT",
        dashboardPayload(cnr),
      );
      if (result?.error) throw new Error(result.error);
    } catch (e) {
      setFetchStatus({ message: e.message, actionNeeded: true });
    }
  }
  const filtered = cases.filter((c) =>
    JSON.stringify([c.cnr, c.data]).toLowerCase().includes(query.toLowerCase()),
  );
  const detailedCount = cases.filter((c) => c.hasDetails).length;
  const stageCounts = new Map([
    ["NBW", 0],
    ["SUMMONS", 0],
    ["EVIDENCES", 0],
    ["FOR STEPS", 0],
  ]);
  for (const item of cases.filter((c) => c.hasDetails)) {
    const rawStage = item.data.case_stage;
    const stage =
      typeof rawStage === "string"
        ? rawStage.trim().replace(/\s+/g, " ").toUpperCase()
        : "";
    const label =
      !stage || stage === "-" || stage === "—" ? "Stage not recorded" : stage;
    stageCounts.set(label, (stageCounts.get(label) || 0) + 1);
  }
  const totals = [
    ["Saved cases", cases.length],
    ["Details captured", cases.filter((c) => c.hasDetails).length],
    ["Awaiting details", cases.filter((c) => !c.hasDetails).length],
    ["Pending", cases.filter((c) => c.data.case_status === "Pending").length],
    ["Disposed", cases.filter((c) => c.data.case_status === "Disposed").length],
    [
      "Status unknown",
      cases.filter(
        (c) =>
          c.hasDetails && !["Pending", "Disposed"].includes(c.data.case_status),
      ).length,
    ],
  ];
  return (
    <div className="verity-console">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <aside className="console-sidebar" aria-label="Workspace navigation">
        <a className="console-brand" href="/" aria-label="Lawcovery home">
          <span className="console-brand-mark">
            <WorkspaceIcon name="lawcovery" size={28} />
          </span>
          <span className="brand-wordmark">
            <span className="brand-law">law</span>covery
            <span className="brand-period">.</span>
          </span>
        </a>
        <p className="sidebar-caption">LEGAL COLLECTIONS</p>
        <nav className="sidebar-nav" aria-label="Workspace views">
          {[
            ["overview", "Overview", "overview"],
            ["analytics", "Analytics", "analytics"],
            ["cases", "Cases", "cases"],
            ["calendar", "Hearing calendar", "calendar"],
            ["connections", "Connections", "connection"],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              aria-label={label}
              aria-pressed={portfolioView === key}
              onClick={() => setPortfolioView(key)}
            >
              <WorkspaceIcon name={icon} />
              <span>{label}</span>
              {key === "cases" && (
                <span className="nav-count" aria-hidden="true">
                  {cases.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footnote">
          <WorkspaceIcon name="shield" size={22} />
          <strong>A record of every change.</strong>
          <p>Your case updates and audit history, together in one workspace.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          Company workspace
        </div>
      </aside>
      <div className="console-body">
        <header className="console-header">
          <label className="workspace-switcher">
            <span>Company workspace</span>
            <select
              disabled={busy || loading}
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
          <div className="console-header-actions">
            <button
              className="refresh-button"
              disabled={!workspace || busy}
              onClick={() => perform(refresh)}
            >
              <WorkspaceIcon name="refresh" size={17} />
              <span>{busy ? "Loading…" : "Refresh cases"}</span>
            </button>
            <div className="console-account">
              <span className="account-avatar" aria-hidden="true">
                {session.user.email?.slice(0, 1).toUpperCase() || "V"}
              </span>
              <span>{session.user.email}</span>
            </div>
            <button
              className="signout-button"
              disabled={pending || busy}
              onClick={onSignOut}
            >
              <WorkspaceIcon name="logout" size={17} />
              <span>{pending ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </header>
        <main className="console-main" id="workspace-content" tabIndex="-1">
          <div className="console-title">
            <div>
              <p className="console-eyebrow">
                YOUR WORKSPACE /{" "}
                {
                  {
                    overview: "OVERVIEW",
                    analytics: "ANALYTICS",
                    cases: "CASES",
                    calendar: "COURT DIARY",
                    connections: "CONNECTIONS",
                  }[portfolioView]
                }
              </p>
              <h1>
                {
                  {
                    overview: "Your portfolio, in focus.",
                    analytics: "Your cases, by the numbers.",
                    cases: "Your case portfolio.",
                    calendar: "Your hearing diary.",
                    connections: "Connected to your workflow.",
                  }[portfolioView]
                }
              </h1>
              <p>
                {
                  {
                    overview:
                      "A clear view of your cases, stages and captured court records.",
                    analytics:
                      "Explore case progress, hearing workload and the quality of your saved records.",
                    cases:
                      "Find a case, review its progress, and see the latest saved details.",
                    calendar:
                      "Plan around your court dates and see what’s coming next.",
                    connections:
                      "Manage your company workspace and automatic eCourts capture.",
                  }[portfolioView]
                }
              </p>
            </div>
            <a
              className="console-link button-primary"
              href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index"
              target="_blank"
              rel="noreferrer"
            >
              <WorkspaceIcon name="external" size={17} />
              Open eCourts
            </a>
          </div>
          {error && (
            <div className="console-error" role="alert">
              {error}
            </div>
          )}
          {batch && (
            <section
              className="case-fetch-status batch-capture-panel"
              aria-label="Automatic case detail capture"
            >
              <div className="batch-heading">
                <div>
                  <p className="panel-kicker">COURT SYNC</p>
                  <h2>Automatic detail capture</h2>
                </div>
                <span className="coverage-badge">{batch.state}</span>
                <div className="batch-actions">
                  {" "}
                  <button
                    disabled={batchBusy || ["paused", "attention", "complete"].includes(
                      batch.state,
                    )}
                    onClick={() => batchControl("BATCH_PAUSE")}
                  >
                    Pause queue
                  </button>{" "}
                  <button
                    disabled={batchBusy || !["paused", "attention"].includes(batch.state)}
                    onClick={() => batchControl("BATCH_RESUME")}
                  >
                    Resume queue
                  </button>
                </div>
              </div>
              <fieldset className="batch-fetch-modes" disabled={batchBusy}>
                <legend>Choose what to fetch</legend>
                <div className="batch-mode-options">
                  <button
                    aria-pressed={batch.mode === "missing"}
                    disabled={batch.state === "fetching"}
                    onClick={() => batchControl("BATCH_START", "missing")}
                  >
                    Fetch missing details
                  </button>
                  <button
                    aria-pressed={batch.mode === "existing"}
                    disabled={batch.state === "fetching"}
                    onClick={() => batchControl("BATCH_START", "existing")}
                  >
                    Refresh existing details
                  </button>
                </div>
                <p>
                  Missing means no saved case detail record; a search row alone
                  does not count. Each option starts a new queue for the loaded
                  eCourts search and applies to future searches on this connection.
                </p>
              </fieldset>
              <p>
                <strong>Mode: {batch.mode === "existing" ? "Refresh existing details" : "Fetch missing details"}</strong>
                {batch.sourceTotal != null && ` · ${batch.sourceTotal} cases in the loaded source search`}
              </p>
              <progress
                aria-label="Selected cases processed"
                hidden={!batch.total}
                max={batch.total || 1}
                value={batch.processed ?? batch.saved}
              />
              <div className="batch-summary">
                <p role="status">
                  <strong>
                    {batch.processed ?? batch.saved} of {batch.total}
                  </strong>{" "}
                  processed · {batch.saved} saved · {batch.skipped || 0} skipped · {batch.waiting} remaining · {batch.failed} failed
                </p>
                {batch.current && <p>Current case: {batch.current}</p>}
              </div>
              <p>{batch.message}</p>
              <details>
                <summary>Capture guidance</summary>
                <p>
                  Keep your eCourts tab open. Cases are fetched one at a time
                  with a delay between requests. Complete any CAPTCHA there,
                  then resume if needed.
                </p>
              </details>
              {batchError && <p role="alert">{batchError}</p>}
            </section>
          )}
          {fetchStatus && !selected && (
            <div className="case-fetch-status" role="status">
              {fetching && (
                <progress aria-label="Fetching court case details" />
              )}
              <p>{fetchStatus.message}</p>
              {fetchStatus.actionNeeded && (
                <>
                  <p>
                    Complete any CAPTCHA or repeat the search in eCourts, then
                    use View or Refresh from eCourts again.
                  </p>
                  <button onClick={focusCourt}>Go to eCourts tab</button>
                </>
              )}
            </div>
          )}
          {loading ? (
            <p role="status">Loading workspaces…</p>
          ) : (
            <>
              {(!workspace || portfolioView === "connections") && (
                <div className="workspace-setup">
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
                      Each company workspace keeps its case records separate.
                      Only workspace members can access them.
                    </p>
                  </details>
                </div>
              )}
              {workspace && (
                <>
                  {portfolioView === "calendar" ? (
                    <HearingCalendar
                      key={workspace}
                      cases={cases}
                      onOpenCase={openSavedCase}
                    />
                  ) : portfolioView === "analytics" ? (
                    <Suspense
                      fallback={<p role="status">Loading analytics…</p>}
                    >
                      <AnalyticsDashboard
                        key={workspace}
                        cases={cases}
                        onOpenCase={openSavedCase}
                      />
                    </Suspense>
                  ) : portfolioView === "overview" ? (
                    <>
                      <div className="console-metrics">
                        {totals.map(([label, count]) => (
                          <article key={label}>
                            <div className="metric-heading">
                              <span>{label}</span>
                              <WorkspaceIcon
                                name={
                                  label === "Saved cases"
                                    ? "cases"
                                    : label === "Pending"
                                      ? "clock"
                                      : label === "Disposed"
                                        ? "check"
                                        : "capture"
                                }
                                size={18}
                              />
                            </div>
                            <strong>{count.toLocaleString("en-IN")}</strong>
                            <small>
                              {label === "Saved cases"
                                ? "In your loaded portfolio"
                                : label === "Pending" ||
                                    label === "Disposed" ||
                                    label === "Status unknown"
                                  ? "From detailed case records"
                                  : label === "Details captured"
                                    ? "Court details available"
                                    : "Waiting for detailed capture"}
                            </small>
                          </article>
                        ))}
                      </div>
                      <section
                        className="console-panel"
                        aria-labelledby="stage-counts-heading"
                      >
                        <div className="section-heading">
                          <div>
                            <p className="panel-kicker">CASE PROGRESS</p>
                            <h2 id="stage-counts-heading">Cases by stage</h2>
                          </div>
                          <button onClick={() => setPortfolioView("cases")}>
                            View all cases <span aria-hidden="true">↗</span>
                          </button>
                        </div>
                        <p className="muted">
                          Counts use detailed cases in this workspace. Listed
                          cases awaiting details are excluded. Detailed cases
                          without a captured stage appear under “Stage not
                          recorded”.
                        </p>
                        <dl className="stage-counts">
                          {[...stageCounts].map(([stage, count]) => (
                            <div key={stage}>
                              <dt>
                                <span className="stage-dot" />
                                {stage}
                              </dt>
                              <dd>{count.toLocaleString("en-IN")}</dd>
                              <span className="stage-track" aria-hidden="true">
                                <span
                                  style={{
                                    inlineSize: `${detailedCount ? (count / detailedCount) * 100 : 0}%`,
                                  }}
                                />
                              </span>
                            </div>
                          ))}
                        </dl>
                      </section>
                      {searches[0] && (
                        <section
                          className="console-panel"
                          aria-labelledby="search-summary-heading"
                        >
                          <p className="panel-kicker">SOURCE COVERAGE</p>
                          <h2 id="search-summary-heading">
                            Latest eCourts search
                          </h2>
                          <p>
                            This is the total reported for this search and court
                            selection, not a company-wide or nationwide total.
                            Searches can overlap; their totals are not added
                            together.
                          </p>
                          <div className="search-summary-metrics">
                            <strong>
                              Establishments:{" "}
                              {searches[0].total_establishments ??
                                "Not reported"}
                            </strong>
                            <strong>
                              Reported cases:{" "}
                              {searches[0].reported_cases ?? "Not reported"}
                            </strong>
                            <strong>
                              Rows captured:{" "}
                              {searches[0].loaded_rows -
                                searches[0].skipped_rows}
                            </strong>
                          </div>
                          <p className="muted">
                            Observed {date(searches[0].captured_at)} ·{" "}
                            {Object.values(searches[0].search_context)
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {searches[0].skipped_rows > 0 && (
                            <p role="status">
                              {searches[0].skipped_rows} rows could not be
                              identified safely and were skipped.
                            </p>
                          )}
                          <Table
                            label="Court totals reported by eCourts"
                            headers={[
                              "Court / establishment",
                              "Reported cases",
                            ]}
                            rows={searches[0].court_totals.map((c) => [
                              c.court,
                              c.reported_cases,
                            ])}
                          />
                          <details>
                            <summary>Previous search captures</summary>
                            <Table
                              label="Search capture history"
                              headers={[
                                "Observed",
                                "Selection",
                                "Reported cases",
                                "Captured rows",
                              ]}
                              rows={searches.map((c) => [
                                date(c.captured_at),
                                Object.values(c.search_context)
                                  .filter(Boolean)
                                  .join(" · "),
                                c.reported_cases,
                                c.loaded_rows - c.skipped_rows,
                              ])}
                            />
                          </details>
                        </section>
                      )}
                    </>
                  ) : portfolioView === "connections" ? (
                    <div className="connections-layout">
                      {" "}
                      <section className="console-panel connection-panel">
                        <div className="panel-kicker">
                          <WorkspaceIcon name="connection" size={18} />
                          BROWSER CONNECTION
                        </div>
                        <h2>Connect Chrome for automatic capture</h2>
                        <p>
                          Connect Lawcovery Case Capture in Chrome to save your
                          loaded eCourts cases automatically. Complete CAPTCHA
                          and search in eCourts to start capturing details.
                        </p>
                        <p>
                          Connections stay active until paused, revoked,
                          expired, or you sign out of Lawcovery. Each upload is
                          attributed to the account that created the connection.
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
                      </section>
                      <aside className="connection-help console-panel">
                        <WorkspaceIcon name="shield" size={26} />
                        <h3>Automatic updates. Clear history.</h3>
                        <p>
                          Complete CAPTCHA and search in eCourts. The connected
                          extension fetches missing case details one at a time. Choose
                          Refresh existing details to update already-saved cases.
                        </p>
                        <ul>
                          <li>
                            Keep your eCourts tab open while the queue runs.
                          </li>
                          <li>Pause and resume from the progress panel.</li>
                          <li>Every saved update keeps its own audit trail.</li>
                        </ul>
                      </aside>
                    </div>
                  ) : (
                    <>
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
                          {filtered.length} matching of {cases.length} loaded
                          cases · up to 1,000 detail records and 1,000 listing
                          records, matched by CNR. Counts describe this loaded
                          portfolio. Status/stage counts use detailed cases
                          only. Use Refresh cases after capture.
                        </p>
                        {filtered.length ? (
                          <Table
                            caseList
                            label="Saved court cases"
                            headers={[
                              "Case / CNR",
                              "Parties",
                              "Stage / status",
                              "Next hearing",
                              "Capture coverage",
                              "Last observed",
                            ]}
                            rows={filtered.map((c) => [
                              <button
                                className="case-open"
                                disabled={busy || Boolean(fetching)}
                                onClick={() => fetchCase(c)}
                              >
                                View ·{" "}
                                {c.data.case_reference ||
                                  c.data.registration_number}
                                <small>{c.cnr}</small>
                              </button>,
                              <>
                                {c.data.petitioners?.join("; ") ||
                                  c.data.parties_text}
                                <small>
                                  vs {c.data.respondents?.join("; ")}
                                </small>
                              </>,
                              <>
                                {c.data.case_stage || "—"}
                                <small
                                  className={`status-badge status-${c.data.case_status === "Disposed" ? "disposed" : c.data.case_status === "Pending" ? "pending" : "unknown"}`}
                                >
                                  {c.hasDetails
                                    ? c.data.case_status || "Unknown"
                                    : "Details not captured"}
                                </small>
                              </>,
                              c.data.next_hearing_date || "—",
                              <span
                                className={`coverage-badge ${c.hasDetails ? "coverage-complete" : ""}`}
                              >
                                {c.hasDetails
                                  ? "Details captured"
                                  : "Listed only"}
                              </span>,
                              date(c.last_checked_at || c.last_listed_at),
                            ])}
                          />
                        ) : (
                          <div className="console-empty">
                            <h3>
                              {query
                                ? "No matching cases"
                                : "No cases captured yet"}
                            </h3>
                            <p>
                              Connect the extension, complete CAPTCHA on
                              eCourts, and view search results or open a case.
                              Then refresh this list.
                            </p>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                  {selected && (
                    <dialog
                      ref={caseDialog}
                      className="case-detail-dialog"
                      aria-labelledby="selected-case-heading"
                      onClose={() => {
                        viewOpen.current = false;
                        setSelected(null);
                      }}
                    >
                      <section
                        className="console-panel"
                        aria-label="Selected case"
                      >
                        <div className="section-heading case-dialog-heading">
                          <div>
                            <p className="console-eyebrow">{selected.cnr}</p>
                            <h2 id="selected-case-heading" tabIndex="-1">
                              {selected.data.case_reference ||
                                selected.data.registration_number}
                            </h2>
                          </div>
                          <div>
                            <button
                              disabled={busy || Boolean(fetching)}
                              onClick={() => fetchCase(selected)}
                            >
                              {fetching === selected.cnr
                                ? "Fetching…"
                                : "Refresh from eCourts"}
                            </button>
                            <button onClick={closeCase}>Close details</button>
                          </div>
                        </div>
                        {fetchStatus && (
                          <div className="case-fetch-status" role="status">
                            {fetching && (
                              <progress aria-label="Fetching court case details" />
                            )}
                            <p>{fetchStatus.message}</p>
                            {fetchStatus.actionNeeded && (
                              <>
                                <p>
                                  Complete any CAPTCHA or repeat the search in
                                  eCourts, then use View or Refresh from eCourts
                                  again.
                                </p>
                                <button onClick={focusCourt}>
                                  Go to eCourts tab
                                </button>
                              </>
                            )}
                          </div>
                        )}
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
                        {!selected.hasDetails && (
                          <p className="listing-notice">
                            This case was saved from search results. Use View or
                            Refresh from eCourts to fetch its details through
                            your existing court tab. If asked, complete CAPTCHA
                            or repeat the search there, then retry.
                          </p>
                        )}
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
                              Automatic updates only. Previous and new values
                              are preserved; there is no approval workflow.
                              Showing up to 100 latest events.
                            </p>
                            {!audits.length && !listingAudits.length && (
                              <p>No change events found.</p>
                            )}
                            {listingAudits.map((a) => (
                              <article className="audit-event" key={a.id}>
                                <h3>
                                  {a.action === "listed"
                                    ? "Case first listed"
                                    : "Listing updated"}{" "}
                                  · {date(a.occurred_at)}
                                </h3>
                                <p>
                                  User {a.actor_id} · Search capture{" "}
                                  {a.search_capture_id}
                                </p>
                                <Table
                                  label="Listing changes"
                                  headers={[
                                    "Field",
                                    "Previous value",
                                    "New value",
                                  ]}
                                  rows={Object.entries(a.changes).map(
                                    ([k, v]) => [k, show(v.old), show(v.new)],
                                  )}
                                />
                              </article>
                            ))}
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
                                  headers={[
                                    "Field",
                                    "Previous value",
                                    "New value",
                                  ]}
                                  rows={Object.entries(a.changes).map(
                                    ([k, v]) => [
                                      labels[k] || k,
                                      show(v.old),
                                      show(v.new),
                                    ],
                                  )}
                                />
                              </article>
                            ))}
                          </>
                        )}
                        {tab === "captures" && (
                          <>
                            <p>
                              Up to 100 latest checks, including unchanged and
                              older captures. Snapshots contain extracted
                              fields, not the full court webpage.
                            </p>
                            {!selected.hasDetails && (
                              <p>
                                No detailed page captured yet. Listing changes
                                are recorded under Audit history.
                              </p>
                            )}
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
                    </dialog>
                  )}
                </>
              )}
            </>
          )}
          <footer className="console-footer">
            <WorkspaceIcon name="shield" size={15} />
            <span>
              Source: eCourts Services · Details reflect the last captured page.
              Verify important information with the court record.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
