import React, { useEffect, useRef, useState } from "react";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import { LawcoveryLogo } from "./LawcoveryLogo";

const nav = [
  ["overview", "Overview", "overview"],
  ["analytics", "Analytics", "analytics"],
  ["cases", "Cases", "cases"],
  ["calendar", "Hearing calendar", "calendar"],
  ["connections", "Connections", "connection"],
];
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
  query,
  onQuery,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountView, setAccountView] = useState("");
  const [toast, setToast] = useState(false);
  const profile = useRef(null),
    profileButton = useRef(null),
    menuButton = useRef(null),
    sidebar = useRef(null),
    search = useRef(null),
    dialog = useRef(null),
    toastTimer = useRef(null);
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
  function navigate(value) {
    onNavigate(value);
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
        if (
          !window.matchMedia ||
          window.matchMedia("(min-width: 701px)").matches
        )
          search.current?.focus();
        else {
          navigate("cases");
          requestAnimationFrame(() =>
            document.getElementById("workspace-case-search")?.focus(),
          );
        }
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
          <small>Legal intelligence</small>
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
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-label={label}
              aria-pressed={page === id}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === "cases" && (
                <span className="nav-badge" aria-hidden="true">
                  {count}
                </span>
              )}
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
          <label className="workspace-switcher">
            <span className="eyebrow">Company workspace</span>
            <select
              aria-label="Company workspace"
              disabled={busy || loading}
              value={workspace}
              onChange={(event) => {
                setProfileOpen(false);
                onWorkspace(event.target.value);
              }}
            >
              {!workspace && <option value="">Select a workspace</option>}
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="topbar-spacer" />
          <form
            className="global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate("cases");
            }}
          >
            <Icon name="search" size={17} />
            <input
              ref={search}
              type="search"
              aria-label="Search all cases"
              placeholder="Search cases, parties, courts..."
              value={query}
              onChange={(event) => {
                onQuery(event.target.value);
                onNavigate("cases");
              }}
            />
            <kbd aria-hidden="true">⌘ K</kbd>
          </form>
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
                <small>Company workspace</small>
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
        {children}
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
            {accountView === "profile" ? "Your profile" : "Workspace access"}
          </h2>
          {accountView === "profile" ? (
            <dl>
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Email</dt>
              <dd>{session.user.email}</dd>
              <dt>Company workspace</dt>
              <dd>{company}</dd>
            </dl>
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
