import React, { useEffect, useRef, useState } from "react";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import { LawcoveryLogo } from "./LawcoveryLogo";
import { BrandTicker } from "./BrandTicker";
import { Dropdown } from "./Dropdown";
import { useScrollReveal } from "./Motion";
import "../theme-system.css";

const nav = [
  ["analytics", "Analytics", "overview", "Portfolio, recovery and turnaround charts"],
  ["cases", "Cases", "cases", "Case register, filters and CSV export"],
  ["loan-data", "Loan data", "briefcase", "Import loan amounts from a CSV"],
  ["calendar", "Hearing calendar", "calendar", "Upcoming hearings by month"],
  ["flow", "Legal and recovery flow", "flow", "Legal and recovery stages with target days"],
  ["zonal", "Zone tracker", "pin", "Zone performance and case actions"],
  ["connections", "Connections", "connection", "eCourts search and browser connection"],
];

// Which sidebar tabs a user has chosen to hide. A per-user, per-browser view
// preference only: hiding a tab never changes or removes workspace data.
const hiddenTabsKey = (userId) => `lawcovery-hidden-tabs:${userId || "anonymous"}`;
function readHiddenTabs(userId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(hiddenTabsKey(userId)) || "[]");
    return Array.isArray(value) ? value.filter((id) => nav.some(([tab]) => tab === id)) : [];
  } catch {
    return [];
  }
}
function saveHiddenTabs(userId, ids) {
  try { window.localStorage.setItem(hiddenTabsKey(userId), JSON.stringify(ids)); } catch {}
}
export function accountName(user) {
  return (
    [
      user.user_metadata?.full_name,
      user.user_metadata?.name,
      user.email?.split("@")[0],
    ]
      .find((value) => typeof value === "string" && value.trim())
      ?.trim() || "Your account"
  );
}

export function WorkspaceChrome({
  session,
  workspaces,
  workspace,
  onWorkspace,
  busy,
  loading,
  pending,
  onSignOut,
  onRefresh,
  page,
  onNavigate,
  count,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountView, setAccountView] = useState("");
  const [toast, setToast] = useState(false);
  const [pageTransition, setPageTransition] = useState(0);
  const [hiddenTabs, setHiddenTabs] = useState(() => readHiddenTabs(session.user?.id));
  const visibleNav = nav.filter(([id]) => !hiddenTabs.includes(id));
  const profile = useRef(null),
    profileButton = useRef(null),
    menuButton = useRef(null),
    sidebar = useRef(null),
    dialog = useRef(null),
    pageContent = useRef(null),
    toastTimer = useRef(null);
  // Page blocks rise into view as you scroll; re-armed on every navigation.
  useScrollReveal(pageContent, [page, pageTransition]);
  const name = accountName(session.user);
  const initials = name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const company =
    workspaces.find((item) => item.id === workspace)?.name ||
    "Select a workspace";
  const currentPage = nav.find(([id]) => id === page) || nav[0];
  // Start on a visible tab if the default page has been hidden.
  useEffect(() => {
    if (hiddenTabs.includes(page) && visibleNav[0]) onNavigate(visibleNav[0][0]);
    // Only on first render: later visits to a hidden page (e.g. an analytics
    // drill-down into Cases) are deliberate and must not be redirected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function toggleTab(id) {
    const hide = !hiddenTabs.includes(id);
    if (hide && visibleNav.length <= 1) return; // always keep one tab
    const next = hide ? [...hiddenTabs, id] : hiddenTabs.filter((tab) => tab !== id);
    setHiddenTabs(next);
    saveHiddenTabs(session.user?.id, next);
    if (hide && page === id) {
      const fallback = nav.find(([tab]) => !next.includes(tab));
      if (fallback) navigate(fallback[0]);
    }
  }
  useEffect(() => {
    // The signed-in workspace is intentionally a single, predictable
    // light-blue experience. Clear a historic preference before paint after
    // sign-in so an old dark-mode value cannot leak into the workspace.
    document.documentElement.dataset.uiTheme = "light";
    document.documentElement.style.colorScheme = "light";
    try { window.localStorage.removeItem("lawcovery-theme"); } catch {}
  }, []);
  function navigate(value) {
    onNavigate(value);
    setPageTransition((value) => value + 1);
    setMenuOpen(false);
    setProfileOpen(false);
    if (menuOpen)
      window.requestAnimationFrame?.(() =>
        document.getElementById("workspace-content")?.focus(),
      );
    window.scrollTo?.({
      top: 0,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    function pointer(event) {
      if (!profile.current?.contains(event.target)) setProfileOpen(false);
    }
    function key(event) {
      if (event.key === "Escape") {
        if (profileOpen) {
          setProfileOpen(false);
          profileButton.current?.focus();
        }
        if (menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !event.altKey
      ) {
        if (document.querySelector("dialog[open]")) return;
        event.preventDefault();
        setProfileOpen(false);
        // Search lives on the Cases page; the shortcut takes you there
        // unless the Cases tab has been hidden.
        if (hiddenTabs.includes("cases")) return;
        navigate("cases");
        // Wait a tick for the Cases page to render before focusing its search.
        setTimeout(() => document.getElementById("workspace-case-search")?.focus(), 0);
      }
    }
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [profileOpen, menuOpen, onNavigate]);
  useEffect(() => {
    if (!menuOpen) return;
    sidebar.current?.querySelector('button[aria-pressed="true"]')?.focus();
    function trap(event) {
      if (event.key !== "Tab") return;
      const buttons = [
        ...sidebar.current.querySelectorAll("button:not(:disabled), a[href]"),
      ];
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    sidebar.current?.addEventListener("keydown", trap);
    return () => sidebar.current?.removeEventListener("keydown", trap);
  }, [menuOpen]);
  useEffect(() => {
    if (accountView) dialog.current?.showModal();
  }, [accountView]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  async function refresh() {
    setToast(false);
    clearTimeout(toastTimer.current);
    if (await onRefresh()) {
      setToast(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 2200);
    }
  }
  return (
    <div className="verity-console app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <aside
        ref={sidebar}
        className={`console-sidebar sidebar ${menuOpen ? "sidebar-open" : ""}`}
        aria-label="Workspace navigation"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
      >
        <a className="console-brand brand" href="/" aria-label="Lawcovery home">
          <LawcoveryLogo />
        </a>
        <button
          className="mobile-close"
          onClick={() => {
            setMenuOpen(false);
            menuButton.current?.focus();
          }}
          aria-label="Close menu"
        >
          <Icon name="close" />
        </button>
        <div className="nav-label">Legal collections</div>
        <nav className="sidebar-nav" aria-label="Workspace views">
          {visibleNav.map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              aria-pressed={page === id}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="audit-card">
          <Icon name="shield" />
          <strong>A record of every change.</strong>
          <p>Your case updates and audit history, together in one workspace.</p>
        </div>
        <div className="workspace-status">
          <span />
          Company workspace
        </div>
      </aside>
      {menuOpen && (
        <button
          className="scrim"
          aria-label="Dismiss navigation"
          onClick={() => {
            setMenuOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <div className="console-body app-main" inert={menuOpen || undefined}>
        <header className="console-header topbar">
          <button
            ref={menuButton}
            className="mobile-menu"
            onClick={() => {
              setProfileOpen(false);
              setMenuOpen(true);
            }}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Icon name="menu" />
          </button>
          <a className="topbar-brand" href="/" aria-label="Lawcovery home">
            <LawcoveryLogo />
          </a>
          <nav className="topbar-nav" aria-label="Primary workspace views">
            {visibleNav.map(([id, label]) => (
              <button
                key={id}
                aria-pressed={page === id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <label className="workspace-switcher">
            <span className="eyebrow">Company workspace</span>
            <Dropdown
              ariaLabel="Company workspace"
              disabled={busy || loading}
              value={workspace}
              placeholder="Select a workspace"
              onChange={(value) => {
                setProfileOpen(false);
                onWorkspace(value);
              }}
              options={workspaces.map((item) => ({ value: item.id, label: item.name }))}
            />
          </label>
          <div className="topbar-spacer" />
          <BrandTicker />
          <button
            className="btn btn-outline refresh-button"
            disabled={!workspace || busy}
            onClick={refresh}
          >
            <Icon name="refresh" size={16} />
            {busy ? "Syncing…" : "Sync"}
          </button>
          <div ref={profile} className="profile">
            <button
              ref={profileButton}
              className="profile-trigger"
              aria-expanded={profileOpen}
              aria-controls="workspace-account-menu"
              aria-label={`Account: ${name}`}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <span className="avatar">{initials}</span>
              <span className="profile-summary">
                <strong>{name}</strong>
              </span>
              <span className={`profile-chevron ${profileOpen ? "open" : ""}`}>
                ⌄
              </span>
            </button>
            {profileOpen && (
              <div
                className="profile-menu"
                id="workspace-account-menu"
                role="region"
                aria-label="Account menu"
              >
                <div className="profile-menu-head">
                  <span className="avatar avatar-large">{initials}</span>
                  <div>
                    <strong>{name}</strong>
                    <span>{session.user.email}</span>
                  </div>
                </div>
                <div className="profile-context">
                  <span>Current workspace</span>
                  <strong>{company}</strong>
                </div>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setAccountView("profile");
                  }}
                >
                  <Icon name="briefcase" size={16} />
                  Profile settings
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setAccountView("access");
                  }}
                >
                  <Icon name="shield" size={16} />
                  Workspace access
                </button>
                <button
                  className="profile-signout"
                  disabled={pending || busy}
                  onClick={onSignOut}
                >
                  <Icon name="logout" size={16} />
                  {pending ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="workspace-view-header" key={`${page}-${pageTransition}`} aria-live="polite">
          <span>Workspace view</span>
          <strong>{currentPage[1]}</strong>
        </div>
        <div ref={pageContent} className="workspace-page-transition" key={`content-${page}-${pageTransition}`}>
          {children}
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          Portfolio refreshed successfully
        </div>
      )}
      {accountView && (
        <dialog
          ref={dialog}
          className="account-dialog"
          aria-labelledby="account-dialog-title"
          onClose={() => {
            setAccountView("");
            profileButton.current?.focus();
          }}
        >
          <button
            className="btn btn-outline"
            onClick={() => dialog.current.close()}
          >
            Close
          </button>
          <h2 id="account-dialog-title">
            {accountView === "profile" ? "Profile settings" : "Workspace access"}
          </h2>
          {accountView === "profile" ? (
            <>
            <dl>
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Email</dt>
              <dd>{session.user.email}</dd>
              <dt>Company workspace</dt>
              <dd>{company}</dd>
            </dl>
            <section className="tab-settings" aria-labelledby="tab-settings-title">
              <h3 id="tab-settings-title">Sidebar tabs</h3>
              <p className="muted">Choose which tabs appear in your sidebar. Hidden tabs keep all their data and can be shown again at any time.</p>
              <ul className="tab-toggles">
                {nav.map(([id, label, icon, description]) => {
                  const shown = !hiddenTabs.includes(id);
                  const locked = shown && visibleNav.length <= 1;
                  return (
                    <li key={id}>
                      <span className="tab-toggle-icon"><Icon name={icon} size={18} /></span>
                      <span className="tab-toggle-copy">
                        <strong>{label}</strong>
                        <small>{locked ? "At least one tab must stay visible" : description}</small>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        className="tab-switch"
                        aria-checked={shown}
                        aria-label={`Show ${label} tab`}
                        disabled={locked}
                        onClick={() => toggleTab(id)}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
                          <p className="muted">Saved for your account on this browser.</p>
            </section>
            </>
          ) : (
            <>
              <p>Company workspaces available to your signed-in account.</p>
              <ul>
                {workspaces.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </>
          )}
          <p className="muted">
            Account and workspace permissions are managed by your organisation.
          </p>
        </dialog>
      )}
    </div>
  );
}
