import React, { useState } from 'react';
import { configurationError, supabase } from './lib/supabase';

export function ResetRequest() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!supabase) { setMessage(configurationError); return; }
    const email = new FormData(e.currentTarget).get('resetEmail').trim();
    setPending(true); setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?mode=recovery` });
      setMessage(error ? error.message : 'If an account exists for this email, you will receive a password reset link. Check your inbox.');
    } catch { setMessage('Could not connect. Check your connection and try again.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}><p>Enter your work email to request a password reset link.</p><label htmlFor="resetEmail">Work email</label><div className="input-wrap"><input id="resetEmail" name="resetEmail" type="email" autoComplete="email" required placeholder="you@company.com" disabled={pending}/></div><button className="primary-button" disabled={pending}>{pending?'Sending…':'Send reset link'}</button><p role="status" className="status-message">{message}</p></form>;
}

export function RecoveryForm({ onComplete }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (data.get('newPassword') !== data.get('confirmPassword')) { setMessage('The passwords do not match.'); return; }
    setPending(true); setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password: data.get('newPassword') });
      if (error) { setMessage(error.message); return; }
      form.reset(); setUpdated(true);
      setMessage('Password updated. Select “Continue to workspace” to finish.');
    } catch { setMessage('Could not update your password. Check your connection and try again.'); }
    finally { setPending(false); }
  }
  return <main className="auth-loading"><section className="recovery-card"><h2>{updated?'Password updated':'Choose a new password'}</h2>{updated?<><p role="status">{message}</p><button className="primary-button" onClick={onComplete}>Continue to workspace</button></>:<form onSubmit={submit}><p>Use at least 8 characters, or your organisation’s required minimum.</p><label htmlFor="newPassword">New password</label><div className="input-wrap"><input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required disabled={pending}/></div><label className="recovery-label" htmlFor="confirmPassword">Confirm password</label><div className="input-wrap"><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required disabled={pending}/></div><button className="primary-button" disabled={pending}>{pending?'Updating…':'Update password'}</button><p role="status" className="status-message">{message}</p></form>}</section></main>;
}
