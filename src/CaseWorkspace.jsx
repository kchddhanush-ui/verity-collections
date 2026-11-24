import { CourtPartySearch } from "./components/CourtPartySearch";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./workspace-theme.css";
import { mergePortfolio } from "./lib/portfolio";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { HearingCalendar } from "./components/HearingCalendar";
import { parseCourtDate } from "./lib/hearings";
import { currentRecordedStage, decisionOrLatestStatusDate, previousRecordedStage } from "./lib/caseStages";
import { caseCsv } from "./lib/csv";
import { buildAnalytics, caseStatus, filterCases, courtName, filingYear } from "./lib/analytics";
import { WorkspaceChrome } from "./components/WorkspaceChrome";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { RecoveryFlow } from "./components/RecoveryFlow";
import { ZonalActions } from "./components/ZonalActions";
import { LoanDataImport } from "./components/LoanDataImport";
import { Dropdown } from "./components/Dropdown";
import { extensionRequest } from "./lib/extensionBridge";

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
  db_amount: "Original Loan Amount",
  pos_recovered: "Amount Recovered",
  pos_as_of_nov_16: "POS as of Nov 16",
  outstanding_amount: "Outstanding Amount",
  recovery_percentage: "Recovery Percentage",
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
function caseFacts(data, loanData = {}) {
  // Cases without imported loan data must not show "₹NaN" rows: drop empty
  // loan fields instead of formatting them as currency.
  const loan = Object.fromEntries(Object.entries(loanData).filter(([, value]) => value != null && value !== ""));
  const fields = { ...data, ...loan };
  const dbAmount = Number(fields.db_amount), recovered = Number(fields.pos_recovered);
  const derived = Number.isFinite(dbAmount) && dbAmount >= 0 ? {
    outstanding_amount: Math.max(0, dbAmount - (Number.isFinite(recovered) ? recovered : 0)),
    recovery_percentage: dbAmount ? ((Number.isFinite(recovered) ? recovered : 0) / dbAmount) * 100 : null,
  } : {};
  return Object.entries({ ...fields, ...derived })
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

// "17 Nov 2026" for summaries where the time of day is noise.
const shortDate = (value) => {
  const instant = Date.parse(value || "");
  return Number.isFinite(instant)
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(instant))
    : "—";
};

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
  const [portfolioView, setPortfolioView] = useState("cases");
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
  async function deleteWorkspace(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const current = workspaces.find((w) => w.id === workspace);
    if (!current) return;
    const typed = String(new FormData(form).get("confirm") || "").trim();
    if (typed !== current.name) {
      setError(`Type "${current.name}" exactly to delete this workspace.`);
      return;
    }
    if (!window.confirm(`Delete "${current.name}" and all its cases permanently? This cannot be undone.`)) return;
    await perform(async () => {
      await call("delete_workspace", { p_workspace: current.id, p_confirm_name: typed });
      const rest = workspaces.filter((w) => w.id !== current.id);
      setWorkspaces(rest);
      setWorkspace(rest[0]?.id || "");
      form.reset();
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
  const currentCaseFilters = caseFilters?.workspace === workspace ? caseFilters : { values: {}, respondent: "" };
  const respondentQuery = currentCaseFilters.respondent.trim().toLowerCase();
  const { stage: selectedStage = "", ...baseCaseFilters } = currentCaseFilters.values;
  // The stage menu deliberately mirrors the "Current stage" column, including
  // cases whose latest stage only exists in the saved hearing history.
  const caseStages = useMemo(
    () => [...new Set(cases
      .filter((item) => item.hasDetails)
      .map((item) => currentRecordedStage(item.data))
      .filter((stage) => stage && stage !== "—"))]
      .sort((left, right) => left.localeCompare(right)),
    [cases],
  );
  const stageCounts = useMemo(
    () => new Map(caseStages.map((stage) => [
      stage,
      cases.filter((item) => item.hasDetails && currentRecordedStage(item.data) === stage).length,
    ])),
    [cases, caseStages],
  );
  const filtered = filterCases(cases, { ...baseCaseFilters, search: query })
    .filter((item) => !selectedStage || (item.hasDetails && currentRecordedStage(item.data) === selectedStage))
    .filter((item) => !respondentQuery || partyColumns(item.data.respondents).names.toLowerCase().includes(respondentQuery))
    .filter((item) => !currentCaseFilters.cnrs || currentCaseFilters.cnrs.has(item.cnr));
  const showingConnections = portfolioView === "connections";
  const showingLoanData = portfolioView === "loan-data";
  const setCaseFilter = (key, value) => setCaseFilters((previous) => {
    const current = previous?.workspace === workspace ? previous : { values: {}, respondent: "" };
    return key === "respondent"
      ? { ...current, workspace, respondent: value }
      : { ...current, workspace, values: { ...current.values, [key]: value } };
  });
  const clearCaseFilters = () => {
    setCaseFilters(null);
    setQuery("");
  };
  const openAnalyticsCases = (filters) => {
    let values = {};
    if (filters.status) values.status = filters.status;
    if (filters.stage) values.stage = filters.stage;
    if (filters.court) values.court = filters.court;
    if (filters.details) values.details = filters.details;
    // The analytics dashboard passes the exact cases behind the number or bar
    // that was clicked (already respecting its court / year filters).
    let selectedCases = Array.isArray(filters.cases) ? filters.cases : cases;
    const analytics = buildAnalytics(cases);
    if (filters.age)
      selectedCases = analytics.age.find((row) => row.label === filters.age)?.cases || [];
    if (filters.pendingOlderThan)
      selectedCases = analytics.longPending.map((row) => row.item);
    if (filters.pendingWithoutNext)
      selectedCases = cases.filter((item) => caseStatus(item) === "Pending" && !parseCourtDate(item.data?.next_hearing_date));
    if (filters.stale) selectedCases = analytics.stale.map((row) => row.item);
    const cnrs = new Set(selectedCases.map((item) => item.cnr));
    setCaseFilters({ workspace, values, respondent: "", cnrs: Array.isArray(filters.cases) || cnrs.size ? cnrs : null });
    setQuery("");
    setPortfolioView("cases");
  };
  const caseHeaders = [
    "Case number", "Case type", "CNR number", "Filing number", "Filing date",
    "Decision / latest status date", "Respondent", "Petitioner", "Petitioner advocate",
    "Current stage", "Previous stage", "Next hearing",
  ];
  const caseValues = (item) => {
    const petitioner = partyColumns(item.data.petitioners);
    const statusDate = decisionOrLatestStatusDate(item);
    return [
      item.data.case_reference || item.data.registration_number || item.cnr,
      item.data.case_type || "", item.cnr, item.data.filing_number || "",
      item.data.filing_date || "", statusDate.value,
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
  const importLoanData = async (filename, preview) => {
    const rows = preview.matched.map((row) => ({ case_id: row.case.id, db_amount: row.db_amount, pos_recovered: row.pos_recovered, pos_as_of_nov_16: row.pos_as_of_nov_16 }));
    const { data, error: importError } = await supabase.rpc("import_loan_data", {
      p_workspace: workspace,
      p_filename: filename,
      p_rows: rows,
      p_summary: { total: preview.total, unmatched: preview.unmatched.length, ambiguous: preview.ambiguous.length, duplicates: preview.duplicates.length, invalid: preview.invalid.length, no_data: preview.noData.length },
    });
    if (importError) throw importError;
    await refresh();
    return data;
  };
  return (
    <WorkspaceChrome
      session={session}
      workspaces={workspaces}
      workspace={workspace}
      onWorkspace={setWorkspace}
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
        {portfolioView !== "calendar" && portfolioView !== "analytics" && portfolioView !== "flow" && portfolioView !== "zonal" && (
          <div className="console-title page-heading">
            <div>
              <p className="console-eyebrow">
                YOUR WORKSPACE / {showingConnections ? "CONNECTIONS" : showingLoanData ? "LOAN DATA" : "CASES"}
              </p>
              <h1>{showingConnections ? "Connected to your workflow." : showingLoanData ? "Import loan and recovery data." : "Your case portfolio."}</h1>
              <p>
                {showingConnections
                  ? "Manage your company workspace and automatic eCourts capture."
                  : showingLoanData
                    ? "Upload a validated CSV to update loan amounts on matching saved cases."
                    : "Find a case, review its progress, and see the latest saved details."}
              </p>
            </div>
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
          <div className="cx-page" hidden={portfolioView !== "connections"}>
            {portfolioView === "connections" && (() => {
              const extensionOk = connectionStatus?.state === "connected";
              const detailed = cases.filter((item) => item.hasDetails).length;
              const latest = searches[0];
              const running = batch && !["complete"].includes(batch.state);
              return (
                <div className="cx-overview" aria-label="Connection status">
                  <div className={`cx-tile ${extensionOk ? "is-good" : "is-warn"}`}>
                    <span className="cx-tile-label"><i className="cx-dot" />Chrome extension</span>
                    <strong>{extensionOk ? "Connected" : connectionStatus ? "Not connected" : "Checking…"}</strong>
                    <small>{extensionOk ? "Captures save to this workspace" : "See Browser connection"}</small>
                  </div>
                  <div className="cx-tile">
                    <span className="cx-tile-label">Latest eCourts search</span>
                    <strong>{latest ? shortDate(latest.captured_at) : "No searches yet"}</strong>
                    <small>{latest ? `${latest.reported_cases ?? "—"} cases reported · ${latest.loaded_rows - latest.skipped_rows} captured` : "Run a party-name search below"}</small>
                  </div>
                  <div className="cx-tile">
                    <span className="cx-tile-label">Case details saved</span>
                    <strong>{detailed.toLocaleString("en-IN")} <span>of {cases.length.toLocaleString("en-IN")}</span></strong>
                    <span className="cx-meter" aria-hidden="true"><i style={{ inlineSize: `${cases.length ? (detailed / cases.length) * 100 : 0}%` }} /></span>
                  </div>
                  <div className={`cx-tile ${running ? "is-live" : ""}`}>
                    <span className="cx-tile-label"><i className="cx-dot" />Automatic capture</span>
                    <strong>{batch ? batch.state.charAt(0).toUpperCase() + batch.state.slice(1) : "Idle"}</strong>
                    <small>{batch?.total ? `${batch.processed ?? batch.saved} of ${batch.total} processed` : "Starts after a search"}</small>
                  </div>
                </div>
              );
            })()}

            <div className="cx-grid">
              <div className="cx-main">
                <CourtPartySearch key={workspace} dashboardPayload={dashboardPayload} onCaptureChallenge={batch?.current ? focusCourt : undefined} onSaved={() => perform(refresh)} />

                {portfolioView === "connections" && batch && (
                  <section className="cx-card cx-sync batch-capture-panel" aria-label="Automatic case detail capture">
                    <header className="cx-card-head">
                      <div>
                        <p className="panel-kicker">COURT SYNC</p>
                        <h2>Automatic detail capture</h2>
                      </div>
                      <span className={`cx-state is-${batch.state}`}>{batch.state}</span>
                    </header>
                    <div className="cx-progress">
                      <div className="cx-progress-head">
                        <strong>{batch.processed ?? batch.saved} <span>of {batch.total || 0} processed</span></strong>
                        {batch.current && <span className="cx-current">Now: {batch.current}</span>}
                      </div>
                      <progress aria-label="Selected cases processed" max={batch.total || 1} value={batch.processed ?? batch.saved} />
                    </div>
                    <div className="cx-stats" role="status">
                      <span className="is-good"><b>{batch.saved}</b>saved</span>
                      <span><b>{batch.skipped || 0}</b>skipped</span>
                      <span><b>{batch.waiting}</b>remaining</span>
                      <span className={batch.failed ? "is-bad" : ""}><b>{batch.failed}</b>failed</span>
                    </div>
                    {batch.message && <p className="cx-message">{batch.message}</p>}
                    <div className="cx-sync-controls">
                      <div className="cx-segment" role="group" aria-label="What to fetch">
                        <button aria-pressed={batch.mode === "missing"} disabled={batchBusy || batch.state === "fetching"} onClick={() => batchControl("BATCH_START", "missing")}>Fetch missing details</button>
                        <button aria-pressed={batch.mode === "existing"} disabled={batchBusy || batch.state === "fetching"} onClick={() => batchControl("BATCH_START", "existing")}>Refresh existing details</button>
                      </div>
                      <div className="cx-actions">
                        <button className="btn" disabled={batchBusy || ["paused", "attention", "complete"].includes(batch.state)} onClick={() => batchControl("BATCH_PAUSE")}>Pause</button>
                        <button className="btn btn-primary" disabled={batchBusy || !["paused", "attention"].includes(batch.state)} onClick={() => batchControl("BATCH_RESUME")}>Resume</button>
                      </div>
                    </div>
                    <p className="cx-note">
                      {batch.mode === "existing" ? "One-time refresh of already saved cases." : "Only cases without saved details are fetched."}
                      {batch.sourceTotal != null && ` ${batch.sourceTotal} cases in the loaded search`}
                      {batch.existingDetails != null && batch.missingDetails != null && ` · ${batch.existingDetails} already saved · ${batch.missingDetails} missing before this run`}.
                    </p>
                    {batch.current && (
                      <div className="cx-callout">
                        <p>If eCourts asks for a CAPTCHA, enter it in the capture tab, then resume.</p>
                        <button className="btn" type="button" onClick={focusCourt}>Show eCourts / CAPTCHA</button>
                      </div>
                    )}
                    {batchError && <p className="cx-error" role="alert">{batchError}</p>}
                  </section>
                )}

                {portfolioView === "connections" && fetchStatus && !selected && (
                  <div className="cx-card cx-fetch case-fetch-status" role="status">
                    {fetching && <progress aria-label="Fetching court case details" />}
                    <p>{fetchStatus.message}</p>
                    {fetchStatus.actionNeeded && (
                      <div className="cx-callout">
                        <p>Complete any CAPTCHA or repeat the search in eCourts, then use View or Refresh from eCourts again.</p>
                        <button className="btn" onClick={focusCourt}>Go to eCourts tab</button>
                      </div>
                    )}
                  </div>
                )}
                {portfolioView === "connections" && (
                    <section className="cx-card cx-how">
                      <p className="panel-kicker">HOW IT WORKS</p>
                      <ol>
                        <li><b>1</b><div><strong>Connect Chrome</strong><span>The Lawcovery extension links to this workspace once.</span></div></li>
                        <li><b>2</b><div><strong>Search by party name</strong><span>Pick the court, enter the party and type the CAPTCHA.</span></div></li>
                        <li><b>3</b><div><strong>Details save automatically</strong><span>Cases are fetched one at a time; every update keeps an audit trail.</span></div></li>
                      </ol>
                    </section>
                )}
              </div>

              {portfolioView === "connections" && (
                <aside className="cx-side">
                  <section className="cx-card cx-browser">
                    <header className="cx-card-head">
                      <div>
                        <p className="panel-kicker">BROWSER CONNECTION</p>
                        <h2>Chrome capture</h2>
                      </div>
                    </header>
                    <p className={`cx-status ${connectionStatus?.state === "connected" ? "is-good" : "is-warn"}`} role="status">
                      <i className="cx-dot" />{connectionStatus?.message || "Checking Chrome connection…"}
                    </p>
                    {["disconnected", "different"].includes(connectionStatus?.state) && (
                      <button className="btn btn-primary cx-wide" disabled={busy} onClick={connect}>Connect this workspace</button>
                    )}
                    {connections.some((c) => !c.revoked_at) && (
                      <ul className="cx-devices">
                        {/* Revoked connections are history, not devices: hide them. */}
                        {connections.filter((c) => !c.revoked_at).map((c) => {
                          const state = c.revoked_at ? "Revoked" : new Date(c.expires_at) < new Date() ? "Expired" : `Expires ${date(c.expires_at)}`;
                          return (
                            <li key={c.id}>
                              <div>
                                <strong>{c.label}</strong>
                                <small className={c.revoked_at || state === "Expired" ? "is-muted" : ""}>{state}</small>
                              </div>
                              {!c.revoked_at && (
                                <button className="cx-link-button" disabled={busy} onClick={() => perform(async () => { await call("revoke_capture_connection", { p_id: c.id }); await refresh(); })}>Revoke</button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <a className="cx-external" href="https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index" target="_blank" rel="noreferrer">
                      <WorkspaceIcon name="external" size={15} /> Open eCourts
                    </a>
                  </section>

                </aside>
              )}
            </div>

            {portfolioView === "connections" && searches[0] && (
              <section className="cx-card cx-history" aria-labelledby="search-summary-heading">
                <header className="cx-card-head">
                  <div>
                    <p className="panel-kicker">SOURCE COVERAGE</p>
                    <h2 id="search-summary-heading">Latest eCourts search</h2>
                  </div>
                  <span className="cx-when">{shortDate(searches[0].captured_at)}</span>
                </header>
                <div className="cx-chips">
                  {Object.values(searches[0].search_context).filter(Boolean).map((value) => <span key={value}>{value}</span>)}
                </div>
                <div className="cx-metrics">
                  <div><strong>{searches[0].reported_cases ?? "—"}</strong><span>Cases reported</span></div>
                  <div><strong>{searches[0].loaded_rows - searches[0].skipped_rows}</strong><span>Rows captured</span></div>
                  <div><strong>{searches[0].total_establishments ?? "—"}</strong><span>Establishments</span></div>
                  <div className={searches[0].skipped_rows ? "is-warn" : ""}><strong>{searches[0].skipped_rows}</strong><span>Rows skipped</span></div>
                </div>
                {searches[0].court_totals?.length > 0 && (
                  <Table label="Court totals reported by eCourts" headers={["Court / establishment", "Reported cases"]} rows={searches[0].court_totals.map((c) => [c.court, c.reported_cases])} />
                )}
                <details className="cx-details">
                  <summary>Previous searches ({searches.length})</summary>
                  <Table
                    label="Search capture history"
                    headers={["Observed", "Selection", "Reported cases", "Captured rows"]}
                    rows={searches.map((c) => [date(c.captured_at), Object.values(c.search_context).filter(Boolean).join(" · "), c.reported_cases, c.loaded_rows - c.skipped_rows])}
                  />
                </details>
                <p className="cx-note">Totals are for that search and court selection, not company-wide. Overlapping searches are not added together.</p>
              </section>
            )}

            {portfolioView === "connections" && (
              <details className="cx-card cx-workspaces">
                <summary>
                  <span><strong>Company workspaces</strong><small>Create a separate workspace for another company</small></span>
                </summary>
                <form className="inline-form" onSubmit={createWorkspace}>
                  <label>
                    Company name
                    <input name="name" required maxLength="120" placeholder="Your company" />
                  </label>
                  <button className="btn btn-primary" disabled={busy}>Create workspace</button>
                </form>
                <p className="cx-note">Each workspace keeps its case records separate. Only workspace members can access them.</p>
                {workspace && (
                  <form className="inline-form cx-danger" onSubmit={deleteWorkspace}>
                    <label>
                      Delete “{workspaces.find((w) => w.id === workspace)?.name}” — type its name to confirm
                      <input name="confirm" required maxLength="120" autoComplete="off" placeholder={workspaces.find((w) => w.id === workspace)?.name} />
                    </label>
                    <button className="btn btn-danger" disabled={busy}>Delete workspace</button>
                  </form>
                )}
                {workspace && <p className="cx-note">Deletes the workspace with all its cases, captures and imports. Only the owner who created it can do this.</p>}
              </details>
            )}
          </div>
        )}
        {loading ? (
          <p role="status">Loading workspaces…</p>
        ) : (
          <>
            {!workspace && (
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
                {portfolioView === "analytics" ? (
                  <AnalyticsDashboard cases={cases} onDrillDown={openAnalyticsCases} />
                ) : portfolioView === "flow" ? (
                  <RecoveryFlow />
                ) : portfolioView === "zonal" ? (
                  <ZonalActions cases={cases} />
                ) : portfolioView === "calendar" ? (
                  <HearingCalendar
                    key={workspace}
                    cases={cases}
                    onOpenCase={openSavedCase}
                  />
                ) : showingLoanData ? (
                  <LoanDataImport cases={cases} onImport={importLoanData} />
                ) : showingConnections ? null : (
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
                          <Dropdown ariaLabel="Court name" value={currentCaseFilters.values.court || ""}
                            onChange={(value) => setCaseFilter("court", value)}
                            options={[{ value: "", label: "All courts" }, ...[...new Set(cases.map(courtName))].sort()]} />
                        </label>
                        <label>Filing year
                          <Dropdown ariaLabel="Filing year" value={currentCaseFilters.values.year || ""}
                            onChange={(value) => setCaseFilter("year", value)}
                            options={[{ value: "", label: "All years" }, ...[...new Set(cases.map(filingYear).filter(Boolean))].sort().reverse()]} />
                        </label>
                        <label>Case details
                          <Dropdown ariaLabel="Case details" value={currentCaseFilters.values.details || ""}
                            onChange={(value) => {
                              setCaseFilter("details", value);
                              perform(refresh);
                            }}
                            options={[
                              { value: "", label: "All cases" },
                              { value: "available", label: `Available · ${cases.filter((item) => item.hasDetails).length}` },
                              { value: "missing", label: `Not available · ${cases.filter((item) => !item.hasDetails).length}` },
                            ]} />
                        </label>
                        <label>Current stage
                          <Dropdown ariaLabel="Current stage" value={selectedStage}
                            onChange={(value) => setCaseFilter("stage", value)}
                            options={[{ value: "", label: "All stages" }, ...caseStages.map((stage) => ({ value: stage, label: `${stage} · ${stageCounts.get(stage)}` }))]} />
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
                        {currentCaseFilters.values.details === "missing" && currentCaseFilters.values.year &&
                          " Your filing-year filter also applies. Search-only records may have no filing date."}
                      </p>
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
                            "Filing date", "Decision / latest status date", "Respondent", "Petitioner",
                            "Petitioner advocate", "Current stage", "Previous stage", "Next hearing",
                          ]}
                          rows={filtered.map((c) => {
                            const petitioner = partyColumns(c.data.petitioners);
                            const respondent = partyColumns(c.data.respondents);
                            const statusDate = decisionOrLatestStatusDate(c);
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
                              statusDate.source === "latest-status" ? (
                                <span className="case-date-fallback" title="Latest status capture date">
                                  <span>{statusDate.value}</span>
                                  <small>Latest status</small>
                                </span>
                              ) : statusDate.value,
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
                            {caseFacts(selected.data, {
                              // Columns are the current source of truth. The
                              // fallback allows pre-migration records to stay
                              // readable until their next loan-data import.
                              db_amount: selected.db_amount ?? selected.data?.db_amount,
                              pos_recovered: selected.pos_recovered ?? selected.data?.pos_recovered,
                              pos_as_of_nov_16: selected.pos_as_of_nov_16 ?? selected.data?.pos_as_of_nov_16,
                            })
                              .map(([k, v]) => (
                                <div key={k} className={
                                  ["court_number_judge", "parties_text"].includes(k)
                                    ? "case-fact-wide" : undefined
                                }>
                                  <dt>{fieldLabel(k)}</dt>
                                  <dd>{["db_amount", "pos_recovered", "pos_as_of_nov_16", "outstanding_amount"].includes(k) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v)) : k === "recovery_percentage" && v != null ? `${Number(v).toFixed(1)}%` : show(v)}</dd>
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
