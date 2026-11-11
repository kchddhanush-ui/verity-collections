import { CourtPartySearch } from "./components/CourtPartySearch";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./workspace-theme.css";
import { mergePortfolio } from "./lib/portfolio";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { HearingCalendar } from "./components/HearingCalendar";
import { parseCourtDate } from "./lib/hearings";
import { currentRecordedStage, previousRecordedStage } from "./lib/caseStages";
import { caseCsv } from "./lib/csv";
import { filterCases, courtName, filingYear } from "./lib/analytics";
import { WorkspaceChrome } from "./components/WorkspaceChrome";
import { extensionRequest } from "./lib/extensionBridge";

const AnalyticsDashboard = lazy(() =>
  import("./components/AnalyticsDashboard").then((module) => ({
    default: module.AnalyticsDashboard,
  })),
);

function partyColumns(values = []) {
  const entries = (Array.isArray(values) ? values : []).filter((value) => typeof value === "string")
    .map((value) => value.replace(/^\s*\d+\)\s*/, "").split(/\bAdvocate\s*[-:]\s*/i));
  return {
    names: entries.map(([name]) => name.trim()).filter(Boolean).join("; ") || "—",
    advocates: entries.map(([, advocate]) => advocate?.trim()).filter(Boolean).join("; ") || "—",
  };
}


const date = (value) => (value ? new Date(value).toLocaleString() : "—");
const show = (value) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
const labels = {
  case_reference: "Case reference",
  registration_number: "Case number",
  case_type: "Case type",
  case_status: "Status",
  case_stage: "Stage",
  filing_number: "Filing number",
  filing_date: "Filing date",
  registration_date: "Registration date",
  first_hearing_date: "First hearing",
  next_hearing_date: "Next hearing",
  decision_date: "Decision Date",
  disposal_date: "Disposal date",
  nature_of_disposal: "Nature of disposal",
  court: "Court",
  court_number_judge: "Court number / judge",
  parties_text: "Parties",
  serial_number: "Search result row",
  petitioners: "Petitioners / advocates",
  respondents: "Respondents / advocates",
  acts: "Acts / sections",
  processes: "Processes",
  history: "Hearing history",
  orders: "Orders",
};
const fieldLabel = (key) =>
  labels[key] || key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const factOrder = new Map(Object.keys(labels).map((key, index) => [key, index]));
function caseFacts(data) {
  return Object.entries(data)
    .filter(([, value]) => !Array.isArray(value))
    .sort(([left], [right]) =>
      (factOrder.get(left) ?? 999) - (factOrder.get(right) ?? 999) ||
      fieldLabel(left).localeCompare(fieldLabel(right)),
    );
}
async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
function Table({ headers, rows, label, caseList = false }) {
  return (
    <div
      className={`case-table-wrap table-wrap ${caseList ? "portfolio-table-wrap cases-table" : ""}`}
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
  const [captureUpdate, setCaptureUpdate] = useState("");
  const [searches, setSearches] = useState([]);
  const [caseFilters, setCaseFilters] = useState(null);
  const [caseDrilldown, setCaseDrilldown] = useState(null);
  const [portfolioView, setPortfolioView] = useState("analytics");
  const [listingAudits, setListingAudits] = useState([]);
  const [selected, setSelected] = useState(null),
    [audits, setAudits] = useState([]),
    [captures, setCaptures] = useState([]),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("details");
  const requestedConnection = useRef("");
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
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
  function connect() {
    requestedConnection.current = workspace;
    setConnectionStatus({ message: "Connecting Chrome…" });
    setConnectionAttempt(attempt => attempt + 1);
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
      lastProgress = "",
      connectionVerified = false;
    setBatch(null);
    setBatchError("");
    setCaptureUpdate("");
    if (requestedConnection.current !== workspace) setConnectionStatus(null);
    if (pending || !workspace || !session.access_token) return;
    async function poll() {
      try {
        const ping = await extensionRequest("PING");
        if (!active) return;
        if (!ping?.autoConnect) {
          setConnectionStatus({ message: "Reload Lawcovery Case Capture 1.7.0 in Chrome, then refresh this page." });
        } else if (!connectionVerified || !ping.connected) {
          const result = await extensionRequest("AUTO_CONNECT", {
            ...dashboardPayload(),
            key: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
              import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim(),
            connect: requestedConnection.current === workspace,
          });
          if (!active) return;
          if (result.state !== "permission") requestedConnection.current = "";
          const statuses = {
            connected: "Chrome connected. Automatic capture is on.",
            paused: "Capture is paused. Resume it in the extension popup.",
            permission: "Open the Lawcovery extension popup and choose Allow project access.",
            disconnected: "Chrome is disconnected. Choose Connect this workspace to reconnect.",
            different: "Chrome is connected to a different account or workspace. Choose Connect this workspace to switch.",
          };
          setConnectionStatus({
            state: result.state,
            message: result.error || statuses[result.state] || "Chrome connection could not be verified.",
          });
          connectionVerified = result.state === "connected";
          if (!connectionVerified) {
            setBatch(null);
            return;
          }
          if (result.created) {
            const rows = await call("list_capture_connections", { p_workspace: workspace });
            if (active) setConnections(rows);
          }
          ping.connected = true;
        }
        if (ping?.connected && ping.automaticFetchMode !== "missing") {
          if (active) {
            setBatch(null);
            setCaptureUpdate(
              `Chrome is running ${ping.version ? `Lawcovery Case Capture ${ping.version}` : "an older Lawcovery extension"}. Reload Lawcovery Case Capture 1.7.0 in chrome://extensions, then refresh Lawcovery and eCourts to use missing-only automatic fetches.`,
            );
          }
          return;
        }
        if (active) setCaptureUpdate("");
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
          } else if (active) {
            setBatch(null);
            connectionVerified = false;
          }
        } else if (active) setBatch(null);
      } catch {
        if (active) setConnectionStatus({ message: "Open or reload Lawcovery Case Capture 1.7.0 in Chrome and refresh this page." });
      } finally {
        if (active) timer = setTimeout(poll, 6000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspace, session.access_token, connectionAttempt, pending]);
  async function batchControl(action, mode) {
    setBatchError("");
    setBatchBusy(true);
    try {
      const result = await extensionRequest(action, {
        ...dashboardPayload(),
        ...(mode ? { mode } : {}),
      });
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
          connectionNotice: true,
        });
        return;
      }
      if (!result?.saved) {
        setFetchStatus({
          message:
            result?.message ||
            "Upload pending. Check the extension status, then refresh cases after it syncs.",
          connectionNotice: true,
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
      setFetchStatus({
        message: e.message,
        actionNeeded: true,
        connectionNotice: true,
      });
    } finally {
      setFetching("");
      setBusy(false);
    }
  }
  async function focusCourt() {
    const cnr = selected?.cnr || batch?.current || requestedCnr.current;
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
  const drilldown = caseDrilldown && caseDrilldown.workspace === workspace ? caseDrilldown : null;
  const filtered = filterCases(cases, {
    ...(drilldown?.filters || {}),
    ...(caseFilters?.workspace === workspace ? caseFilters.values : {}),
    search: query,
  }).filter((item) => (!drilldown?.caseIds || drilldown.caseIds.includes(item.cnr)) && (!caseFilters?.respondent ||
    caseFilters.workspace !== workspace ||
    partyColumns(item.data.respondents).names.toLowerCase().includes(caseFilters.respondent.toLowerCase().trim())));
  const currentCaseFilters = caseFilters?.workspace === workspace ? caseFilters : { values: {}, respondent: "" };
  const setCaseFilter = (key, value) => setCaseFilters((previous) => {
    const current = previous?.workspace === workspace ? previous : { values: {}, respondent: "" };
    return key === "respondent"
      ? { ...current, workspace, respondent: value }
      : { ...current, workspace, values: { ...current.values, [key]: value } };
  });
  const clearCaseFilters = () => {
    setCaseFilters(null);
    setCaseDrilldown(null);
    setQuery("");
  };
  const caseHeaders = [
    "Case number", "Case type", "CNR number", "Filing number", "Filing date",
    "Decision date", "Respondent", "Petitioner", "Petitioner advocate",
    "Current stage", "Previous stage", "Next hearing",
  ];
  const caseValues = (item) => {
    const petitioner = partyColumns(item.data.petitioners);
    return [
      item.data.case_reference || item.data.registration_number || item.cnr,
      item.data.case_type || "", item.cnr, item.data.filing_number || "",
      item.data.filing_date || "", item.data.decision_date || "",
      partyColumns(item.data.respondents).names, petitioner.names,
      petitioner.advocates, currentRecordedStage(item.data),
      previousRecordedStage(item.data), item.data.next_hearing_date || "",
    ];
  };
  const downloadCases = () => {
    const blob = new Blob([caseCsv(caseHeaders, filtered.map(caseValues))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Lawcovery-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <WorkspaceChrome
      session={session}
      workspaces={workspaces}
      workspace={workspace}
      onWorkspace={(id) => { setCaseDrilldown(null); setWorkspace(id); }}
      busy={busy}
      loading={loading}
      pending={pending}
      onSignOut={onSignOut}
      onRefresh={async () => {
        let refreshed = false;
        await perform(async () => {
          await refresh();
          refreshed = true;
        });
        return refreshed;
      }}
      page={portfolioView}
      onNavigate={setPortfolioView}
      count={cases.length}
      query={query}
      onQuery={setQuery}
    >
      <main
        className={`console-main content page-${portfolioView}`}
        id="workspace-content"
        tabIndex="-1"
      >
        {portfolioView !== "calendar" && (
          <div className="console-title page-heading">
            <div>
              <p className="console-eyebrow">
                YOUR WORKSPACE /{" "}
                {
                  {
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
                    analytics:
                      "Review pending stages, filing activity and court workload.",
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
            {portfolioView === "connections" && (
              <a
                className="console-link button-primary btn btn-primary"
                href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index"
                target="_blank"
                rel="noreferrer"
              >
                <WorkspaceIcon name="external" size={17} />
                Open eCourts
              </a>
            )}
          </div>
        )}
        {error && (
          <div className="console-error" role="alert">
            {error}
          </div>
        )}
        {portfolioView === "connections" && captureUpdate && (
          <div className="console-error" role="alert">
            {captureUpdate}
          </div>
        )}
        {workspace && (
          <div hidden={portfolioView !== "connections"}>
            <CourtPartySearch key={workspace} dashboardPayload={dashboardPayload} onCaptureChallenge={batch?.current ? focusCourt : undefined} onSaved={() => perform(refresh)} />
          </div>
        )}
        {portfolioView === "connections" && batch && (
          <section
            className="case-fetch-status batch-capture-panel card sync-card"
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
                  disabled={
                    batchBusy ||
                    ["paused", "attention", "complete"].includes(batch.state)
                  }
                  onClick={() => batchControl("BATCH_PAUSE")}
                >
                  Pause queue
                </button>{" "}
                <button
                  disabled={
                    batchBusy || !["paused", "attention"].includes(batch.state)
                  }
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
                eCourts search. Refresh existing details applies to this run
                only. Every new search fetches missing details.
              </p>
            </fieldset>
            <p>
              <strong>
                Mode:{" "}
                {batch.mode === "existing"
                  ? "One-time refresh of existing details"
                  : "Fetch missing details"}
              </strong>
              {batch.sourceTotal != null &&
                ` · ${batch.sourceTotal} cases in the loaded source search`}
            </p>
            {batch.existingDetails != null && batch.missingDetails != null && (
              <p>
                Before this run:{" "}
                <strong>{batch.existingDetails} already saved</strong>
                {" · "}
                <strong>{batch.missingDetails} missing details</strong>.
                {batch.mode === "missing" &&
                  " Only missing details are selected for fetching."}
              </p>
            )}
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
                processed · {batch.saved} saved · {batch.skipped || 0} skipped ·{" "}
                {batch.waiting} remaining · {batch.failed} failed
              </p>
              {batch.current && <p>Current case: {batch.current}</p>}
            </div>
            <p>{batch.message}</p>
            {batch.current && (
              <div className="capture-challenge-actions">
                <p>If eCourts requests a CAPTCHA, open the capture tab below and enter it there. Then resume the queue.</p>
                <button className="btn" type="button" onClick={focusCourt}>Show eCourts / CAPTCHA</button>
              </div>
            )}
            <details>
              <summary>Capture guidance</summary>
              <p>
                Keep your eCourts tab open. Cases are fetched one at a time with
                a delay between requests. Complete any CAPTCHA there, then
                resume if needed.
              </p>
            </details>
            {batchError && <p role="alert">{batchError}</p>}
          </section>
        )}
        {portfolioView === "connections" && fetchStatus && !selected && (
          <div className="case-fetch-status" role="status">
            {fetching && <progress aria-label="Fetching court case details" />}
            <p>{fetchStatus.message}</p>
            {fetchStatus.actionNeeded && (
              <>
                <p>
                  Complete any CAPTCHA or repeat the search in eCourts, then use
                  View or Refresh from eCourts again.
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
                    Each company workspace keeps its case records separate. Only
                    workspace members can access them.
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
                  <Suspense fallback={<p role="status">Loading analytics…</p>}>
                    <AnalyticsDashboard
                      key={workspace}
                      cases={cases}
                      company={workspaces.find((item) => item.id === workspace)?.name || "Company"}
                      onStageCases={({ search, caseIds, ...filters }) => {
                        setCaseFilters(null);
                        setCaseDrilldown({ workspace, filters, caseIds });
                        setQuery(search);
                        setPortfolioView("cases");
                        window.scrollTo?.(0, 0);
                      }}
                    />
                  </Suspense>
                ) : portfolioView === "connections" ? (
                  <div className="connections-layout connections-grid">
                    {" "}
                    <section className="console-panel connection-panel card browser-card">
                      <div className="panel-kicker">
                        <WorkspaceIcon name="connection" size={18} />
                        BROWSER CONNECTION
                      </div>
                      <h2>Chrome capture connection</h2>
                      <p>
                        Lawcovery connects the installed Chrome extension after you sign in.
                        Chrome may ask you to allow access to your Supabase project once.
                        Then use Search by party name to run an eCourts search and enter its CAPTCHA.
                      </p>
                      <p role="status">{connectionStatus?.message || "Checking Chrome connection…"}</p>
                      {["disconnected", "different"].includes(connectionStatus?.state) && (
                        <button disabled={busy} onClick={connect}>
                          Connect this workspace
                        </button>
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
                    <aside className="connection-help console-panel assurance">
                      <WorkspaceIcon name="shield" size={26} />
                      <h3>Automatic updates. Clear history.</h3>
                      <p>
                        Run a party-name search in Lawcovery or search directly in
                        eCourts. The extension fetches missing details one at a time.
                        Choose Refresh existing details to update already-saved
                        cases.
                      </p>
                      <ul>
                        <li>
                          Keep your eCourts tab open while the queue runs.
                        </li>
                        <li>Pause and resume from the progress panel.</li>
                        <li>Every saved update keeps its own audit trail.</li>
                      </ul>
                    </aside>
                    {searches[0] && (
                      <section
                        className="console-panel card source-summary"
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
                            {searches[0].total_establishments ?? "Not reported"}
                          </strong>
                          <strong>
                            Reported cases:{" "}
                            {searches[0].reported_cases ?? "Not reported"}
                          </strong>
                          <strong>
                            Rows captured:{" "}
                            {searches[0].loaded_rows - searches[0].skipped_rows}
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
                          headers={["Court / establishment", "Reported cases"]}
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
                  </div>
                ) : (
                  <>
                    <section className="console-panel card cases-card">
                      <div className="section-heading cases-title">
                        <div><h2>Cases</h2><p className="muted">Find a case and export the results you are viewing.</p></div>
                        <button className="btn btn-primary" type="button" disabled={!filtered.length} onClick={downloadCases}>
                          Download CSV · {filtered.length}
                        </button>
                      </div>
                      <div className="case-register-filters">
                        <label>Court name
                          <select value={currentCaseFilters.values.court ?? caseDrilldown?.filters.court ?? ""}
                            onChange={(event) => setCaseFilter("court", event.target.value)}>
                            <option value="">All courts</option>
                            {[...new Set(cases.map(courtName))].sort().map((court) => <option key={court}>{court}</option>)}
                          </select>
                        </label>
                        <label>Filing year
                          <select value={currentCaseFilters.values.year ?? caseDrilldown?.filters.year ?? ""}
                            onChange={(event) => setCaseFilter("year", event.target.value)}>
                            <option value="">All years</option>
                            {[...new Set(cases.map(filingYear).filter(Boolean))].sort().reverse().map((year) => <option key={year}>{year}</option>)}
                          </select>
                        </label>
                        <label>Case details
                          <select value={currentCaseFilters.values.details || ""}
                            onChange={(event) => {
                              setCaseFilter("details", event.target.value);
                              perform(refresh);
                            }}>
                            <option value="">All cases</option>
                            <option value="available">Available · {cases.filter((item) => item.hasDetails).length}</option>
                            <option value="missing">Not available · {cases.filter((item) => !item.hasDetails).length}</option>
                          </select>
                        </label>
                        <label>Respondent name
                          <input type="search" value={currentCaseFilters.respondent || ""}
                            onChange={(event) => setCaseFilter("respondent", event.target.value)}
                            placeholder="Search respondent" />
                        </label>
                        <label>Search cases
                          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                            id="workspace-case-search" placeholder="Case number, CNR, party or stage" />
                        </label>
                        <button className="btn" type="button" onClick={clearCaseFilters}>Clear filters</button>
                      </div>
                      <p className="muted">
                        Case details available means a case-level record was saved after opening the case.
                        Search-result rows appear under Not available.
                        {currentCaseFilters.values.details === "missing" && (currentCaseFilters.values.year || caseDrilldown?.filters.year) &&
                          " Your filing-year filter also applies. Search-only records may have no filing date."}
                      </p>
                      {caseDrilldown && caseDrilldown.workspace === workspace && (
                        <p className="muted">
                          {Object.values(caseDrilldown.filters).filter(Boolean).join(" · ")}
                          {" "}<button type="button" className="btn" onClick={() => setCaseDrilldown(null)}>Clear stage filters</button>
                        </p>
                      )}
                      <p className="muted">
                        {filtered.length} matching of {cases.length} loaded
                        cases · up to 1,000 detail records and 1,000 listing
                        records, matched by CNR. Counts describe this loaded
                        portfolio. Status/stage counts use detailed cases only.
                        Use Refresh cases after capture.
                      </p>
                      {filtered.length ? (
                        <Table
                          caseList
                          label="Saved court cases"
                          headers={[
                            "Case number", "Case type", "CNR number", "Filing number",
                            "Filing date", "Decision date", "Respondent", "Petitioner",
                            "Petitioner advocate", "Current stage", "Previous stage", "Next hearing",
                          ]}
                          rows={filtered.map((c) => {
                            const petitioner = partyColumns(c.data.petitioners);
                            const respondent = partyColumns(c.data.respondents);
                            return [
                              <button
                                className="case-open"
                                disabled={busy || Boolean(fetching)}
                                onClick={() => fetchCase(c)}
                              >
                                {c.data.case_reference || c.data.registration_number || c.cnr}
                              </button>,
                              c.data.case_type || "—",
                              c.cnr,
                              c.data.filing_number || "—",
                              c.data.filing_date || "—",
                              c.data.decision_date || "—",
                              respondent.names,
                              petitioner.names,
                              petitioner.advocates,
                              currentRecordedStage(c.data),
                              previousRecordedStage(c.data),
                              c.data.next_hearing_date || "—",
                            ];
                          })}
                        />
                      ) : (
                        <div className="console-empty">
                          <h3>
                            {query
                              ? "No matching cases"
                              : "No cases captured yet"}
                          </h3>
                          <p>
                            Saved company cases will appear here. Manage your
                            source connection in Connections.
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
                          {fetchStatus.connectionNotice ? (
                            <>
                              <p>
                                Refresh is not confirmed. Showing saved case
                                information.
                              </p>
                              <button
                                onClick={() => {
                                  closeCase();
                                  setPortfolioView("connections");
                                }}
                              >
                                View connection status
                              </button>
                            </>
                          ) : (
                            <p>{fetchStatus.message}</p>
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
                          Only saved search information is available for this
                          case. Use Refresh from eCourts to request its details.
                          Connection issues can be reviewed in Connections.
                        </p>
                      )}
                      {tab === "details" && (
                        <>
                          <dl className="case-facts">
                            {caseFacts(selected.data)
                              .map(([k, v]) => (
                                <div key={k} className={
                                  ["court_number_judge", "parties_text"].includes(k)
                                    ? "case-fact-wide" : undefined
                                }>
                                  <dt>{fieldLabel(k)}</dt>
                                  <dd>{show(v)}</dd>
                                </div>
                              ))}
                          </dl>
                          {Object.entries(selected.data)
                            .filter(([, v]) => Array.isArray(v))
                            .map(([k, values]) => (
                              <div key={k}>
                                <h3>{fieldLabel(k)}</h3>
                                {Array.isArray(values[0]) ? (
                                  <Table
                                    label={fieldLabel(k)}
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
                                    fieldLabel(k),
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
                            older captures. Snapshots contain extracted fields,
                            not the full court webpage.
                          </p>
                          {!selected.hasDetails && (
                            <p>
                              No detailed page captured yet. Listing changes are
                              recorded under Audit history.
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
    </WorkspaceChrome>
  );
}
