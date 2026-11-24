import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './auth-layout.css';
import './site-dark.css';
import './public-site.css';
import { supabase } from './lib/supabase';
import { useAuth } from './useAuth';
import { extensionRequest } from './lib/extensionBridge';
import { ResetRequest, RecoveryForm } from './PasswordRecovery';
import { AccessRequestForm } from './AccessRequest';
import { LawcoveryLogo } from './components/LawcoveryLogo';
import { PublicLanding } from './components/PublicLanding';
import { CaseStack3D } from './components/CaseStack3D';
import { resolveEntryView } from './lib/entry-view';

const CaseWorkspace = lazy(() => import('./CaseWorkspace').then(module => ({ default: module.CaseWorkspace })));

function Icon({name, size=20, ...props}) {
  const paths = {
    arrow: <><path d="M4 12h16M14 6l6 6-6 6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    folder: <><path d="M3 8V5h7l2 3h9v12H3V8Z"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.folder}</svg>;
}
function Brand() {return <div className="brand"><LawcoveryLogo /></div>}
function App() {
  const auth = useAuth();
  const entryView = resolveEntryView(window.location, auth);
  useEffect(() => {
    document.title = entryView === 'public' ? 'Lawcovery | Legal Recovery' : entryView === 'login' ? 'Lawcovery | Client login' : 'Lawcovery | Legal Recovery';
  }, [entryView]);
  const [pending, setPending] = useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [message,setMessage]=useState('');
  const [dialogType,setDialogType]=useState('');
  const [dialogKey,setDialogKey]=useState(0);
  const dialog=useRef(null);
  function openDialog(type) {setDialogType(type); setDialogKey(k=>k+1); dialog.current.showModal();}
  async function onSubmit(e) {
    e.preventDefault();
    if (!supabase) { setMessage(auth.configurationError); return; }
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') });
      if (error) { setMessage(error.message); return; }
      form.reset();
    } catch { setMessage('Unable to connect to Supabase. Check your connection and try again.'); }
    finally { setPending(false); }
  }
  async function signOut() {
    setPending(true); setMessage('');
    try {
      const { error: revokeError } = await supabase.rpc('revoke_my_capture_connections');
      if (revokeError && !['PGRST202', '42883'].includes(revokeError.code)) { setMessage('Could not revoke extension connections. Check your connection and try signing out again.'); return; }
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) { setMessage(error.message); return; }
      await extensionRequest('RELEASE_CONNECTION', {
        projectUrl: import.meta.env.VITE_SUPABASE_URL?.trim(),
        accessToken: auth.session?.access_token,
      }).catch(() => {});
    } catch { setMessage('Unable to sign out. Please try again.'); }
    finally { setPending(false); }
  }
  if (entryView === 'loading') return <main className="auth-loading" role="status"><Brand/><p>Opening Lawcovery…</p></main>;
  if (entryView === 'recovery') return <RecoveryForm onComplete={() => { window.history.replaceState({}, '', window.location.pathname); auth.setRecovering(false); }}/>;
  if (entryView === 'public') return <PublicLanding/>;

  if (entryView === 'workspace') return <><Suspense fallback={<main className="auth-loading" role="status"><Brand/><p>Opening your workspace…</p></main>}><CaseWorkspace key={auth.session.user.id} session={auth.session} onSignOut={signOut} pending={pending}/></Suspense>{message && <p className="signout-error" role="alert">{message}</p>}</>;

  return <>
    <div className="lg-page">
      <header className="lg-header">
        <a className="lg-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo /></a>
        <nav className="lg-header-links" aria-label="Sign-in help">
          <a className="lg-back" href="?view=home">← Back to home</a>
          <button className="lg-link" type="button" onClick={()=>openDialog('access')}>Request access</button>
        </nav>
      </header>
      <main className="lg-grid">
        <section className="lg-story" aria-labelledby="lg-story-title">
          <p className="lg-eyebrow"><span className="lg-pulse" />Client workspace</p>
          <h1 id="lg-story-title">Every case.<br /><em>A clearer picture.</em></h1>
          <p className="lg-lede">One place to follow your company’s cases, hearings and recovery progress, with a full history of every update.</p>
          <div className="lg-visual"><CaseStack3D idle /></div>
        </section>
        <section className="lg-card" aria-labelledby="lg-form-title">
          <span className="lg-card-icon"><Icon name="lock" size={22} /></span>
          <p className="lg-eyebrow">Your workspace awaits</p>
          <h2 id="lg-form-title">Welcome back.</h2>
          <p className="lg-intro">Sign in with the work email your administrator set up.</p>
          <form onSubmit={onSubmit} className="lg-form">
            <label htmlFor="email">Work email</label>
            <div className="input-wrap"><Icon name="mail" /><input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="username" spellCheck="false" required disabled={pending} /></div>
            <div className="password-label"><label htmlFor="password">Password</label><button className="lg-link" type="button" onClick={()=>openDialog('reset')}>Forgot password?</button></div>
            <div className="input-wrap"><Icon name="lock" /><input id="password" name="password" type={showPassword?'text':'password'} placeholder="Enter your password" autoComplete="current-password" required disabled={pending} /><button className="eye-button" type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}><Icon name="eye" size={19} /></button></div>
            <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in to your workspace'} <Icon name="arrow" size={19} /></button>
            <p className="status-message" role="status">{message || auth.error}</p>
          </form>
          <footer className="lg-card-foot">
            <span className="prototype-note"><span className="green-dot" /> {auth.configurationError ? 'Supabase setup required' : 'Secure email & password sign-in'}</span>
            <span className="lg-access-note">New to Lawcovery? <button className="lg-link" type="button" onClick={()=>openDialog('access')}>Request access</button></span>
          </footer>
        </section>
      </main>
      <footer className="lg-footer">© {new Date().getFullYear()} Lawcovery · Legal recovery for overdue portfolios</footer>
    </div>
    <dialog className={`entry-dialog ${dialogType==='access'?'is-wide':''}`} ref={dialog} onClick={e=>{if(e.target===e.currentTarget)dialog.current.close();}}>
      <button className="dialog-close" autoFocus aria-label="Close dialog" onClick={()=>dialog.current.close()}><Icon name="close"/></button>
      <span className="welcome-icon"><Icon name={dialogType==='reset'?'lock':'shield'} size={24}/></span>
      <h2>{dialogType==='reset'?'Reset your password':'Request workspace access'}</h2>
      {dialogType==='reset' ? <ResetRequest key={dialogKey}/> : <AccessRequestForm key={dialogKey} onDone={()=>dialog.current.close()}/>}
    </dialog>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
