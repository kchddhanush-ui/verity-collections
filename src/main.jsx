import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { supabase } from './lib/supabase';
import { useAuth } from './useAuth';
import { ResetRequest, RecoveryForm } from './PasswordRecovery';
import { CaseWorkspace } from './CaseWorkspace';

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
function Brand() {return <div className="brand"><span className="brand-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m6 8 10 18L26 8M10 8l6 11 6-11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>verity<span className="brand-dot">.</span></span></div>}
function Illustration() {return <div className="art" aria-hidden="true">
  <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
  <div className="float-label"><span className="green-dot"/> A clearer perspective</div>
  <div className="case-card"><div className="case-top"><span className="small-icon"><Icon name="folder"/></span><span>YOUR LEGAL PORTFOLIO</span><span className="dots">•••</span></div><div className="case-title">Every detail. Connected.</div><div className="illustration-bars"><i/><i/><i/></div><div className="case-divider"/><div className="case-bottom"><span>Cases & documents</span><span className="pill">In one place <span>↗</span></span></div></div>
  <div className="scales"><svg viewBox="0 0 200 210" fill="none"><path d="M100 30v148M55 183h90M72 175h56M35 64h130M100 30l-8 10h16l-8-10ZM53 65l-27 59h54L53 65ZM147 65l-27 59h54l-27-59Z" stroke="#cfb982" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><path d="M25 124c0 27 56 27 56 0M119 124c0 27 56 27 56 0" fill="#cfb982" fillOpacity=".2" stroke="#cfb982" strokeWidth="4"/><circle cx="100" cy="52" r="7" fill="#cfb982"/></svg></div>
  <div className="document"><span/><span/><span/><div><Icon name="shield" size={17}/> Clarity at every step</div></div>
</div>}
function App() {
  const auth = useAuth();
  const [pending, setPending] = useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [message,setMessage]=useState('');
  const [demo,setDemo]=useState(false);
  const [dialogType,setDialogType]=useState('');
  const dialog=useRef(null);
  function openDialog(type) {setDialogType(type); dialog.current.showModal();}
  async function onSubmit(e) {
    e.preventDefault();
    if (!supabase) { setMessage(auth.configurationError); return; }
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') });
      if (error) { setMessage(error.message); return; }
      form.reset(); setDemo(false);
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
      setDemo(false);
    } catch { setMessage('Unable to sign out. Please try again.'); }
    finally { setPending(false); }
  }
  if (auth.loading) return <main className="auth-loading" role="status"><Brand/><p>Opening your workspace…</p></main>;
  if (auth.recovering && auth.session) return <RecoveryForm onComplete={() => { window.history.replaceState({}, '', window.location.pathname); auth.setRecovering(false); }}/>;

  if (auth.session) return <><CaseWorkspace key={auth.session.user.id} session={auth.session} onSignOut={signOut} pending={pending}/>{message && <p className="signout-error" role="alert">{message}</p>}</>;

  return <>
    {demo || auth.session ? <div className="workspace"><header><Brand/><button className="text-button" disabled={pending} onClick={auth.session ? signOut : ()=>{setDemo(false);setMessage('');}}>{auth.session ? (pending ? 'Signing out…' : 'Sign out') : 'Back to login'} <Icon name="arrow" size={16}/></button></header><main className="workspace-main"><span className="eyebrow">YOUR COMPANY WORKSPACE</span><h1>A clearer view starts here.</h1><p>{auth.session ? `Signed in as ${auth.session.user.email}. Your eCourts data source is not connected yet.` : 'This is a demo workspace. No live company data is shown.'}</p><p role="status" className="status-message">{message}</p><div className="metrics">{['Total cases','Pending cases','Disposed cases','Upcoming hearings'].map(t=><div key={t}><span>{t}</span><strong>—</strong><small>Awaiting data connection</small></div>)}</div><section className="empty-state"><span className="empty-icon"><Icon name="folder" size={32}/></span><h2>Your case portfolio, in one place.</h2><p>Once a court data source is connected, your company’s cases and status updates will appear here.</p><span className="connection-status">eCourts integration · Coming next</span></section></main><footer>Verity · Legal collections, in focus.</footer></div> :
    <main className="login-layout">
      <section className="story-panel"><Brand/><div className="story-content"><span className="eyebrow"><span/> LEGAL COLLECTIONS, IN FOCUS</span><h1>Every case.<br/>A clearer <em>picture.</em></h1><p>One place to understand your company’s cases,<br className="desktop-break"/> follow their progress, and see what’s next.</p><Illustration/><div className="feature-strip"><span><Icon name="folder" size={17}/> Case visibility</span><span><Icon name="shield" size={17}/> Company workspace</span><span><Icon name="arrow" size={17}/> Clear next steps</span></div></div><div className="story-footer"><span>Built for teams. Designed for clarity.</span><span>01 / THE BIGGER PICTURE</span></div></section>
      <section className="form-panel"><div className="top-note">New to Verity? <button className="text-button" onClick={()=>openDialog('access')}>Request access <span>↗</span></button></div><div className="form-content"><div className="welcome-icon"><Icon name="lock" size={24}/></div><span className="eyebrow form-eyebrow">YOUR WORKSPACE AWAITS</span><h2>Welcome back.</h2><p className="form-intro">Sign in to see the bigger picture.</p><form onSubmit={onSubmit}><label htmlFor="email">Work email</label><div className="input-wrap"><Icon name="mail"/><input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="username" spellCheck="false" required disabled={pending}/></div><div className="password-label"><label htmlFor="password">Password</label><button className="text-button" type="button" onClick={()=>openDialog('reset')}>Forgot password?</button></div><div className="input-wrap"><Icon name="lock"/><input id="password" name="password" type={showPassword?'text':'password'} placeholder="Enter your password" autoComplete="current-password" required disabled={pending}/><button className="eye-button" type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}><Icon name="eye" size={19}/></button></div><button className="primary-button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in to your workspace'} <Icon name="arrow" size={19}/></button><p className="status-message" role="status">{message || auth.error}</p></form><div className="divider"><span/> <span>TAKE A LOOK AROUND</span> <span/></div><button className="demo-button" onClick={()=>setDemo(true)}>Explore the demo <Icon name="arrow" size={18}/></button><p className="demo-note">No account needed. No live company data.</p><div className="prototype-note"><span className="green-dot"/> {auth.configurationError ? 'Supabase setup required' : 'Email & password sign-in'} <span>·</span> Verity</div></div><footer><span>© {new Date().getFullYear()} Verity</span><button className="text-button" onClick={()=>openDialog('help')}>Need help?</button></footer></section>
    </main>}
    <dialog ref={dialog} onClick={e=>{if(e.target===e.currentTarget)dialog.current.close();}}><button className="dialog-close" autoFocus aria-label="Close dialog" onClick={()=>dialog.current.close()}><Icon name="close"/></button><span className="welcome-icon"><Icon name={dialogType==='reset'?'lock':'shield'} size={24}/></span><h2>{dialogType==='reset'?'Reset your password':dialogType==='access'?'Join your company workspace':'Here to help'}</h2>{dialogType==='reset' ? <ResetRequest key={dialogType}/> : <><p>{dialogType==='access'?'Ask your organisation administrator to create your account in Supabase Authentication. Public account registration is not available in this portal.':'Use the email and password provided by your administrator. If sign-in fails, confirm your email or request a password reset. Court data integration is coming next.'}</p><button className="primary-button" onClick={()=>dialog.current.close()}>Got it <Icon name="arrow" size={18}/></button></>}</dialog>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
