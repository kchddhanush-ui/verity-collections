import React, { useState } from 'react';
import { configurationError, supabase } from './lib/supabase';

// Public "Request access" form on the client login page. Submissions go to the
// access_requests table through the submit_access_request() database function;
// visitors cannot read anything back.
export function AccessRequestForm({ onDone }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Honeypot: real people never see or fill this field.
    if (data.get('website')) { setSent({ name: '', email: '' }); return; }
    if (!supabase) { setMessage(configurationError); return; }
    const value = (key) => String(data.get(key) || '').trim();
    const phone = value('phone');
    if (phone && phone.replace(/\D/g, '').length < 6) { setMessage('Please enter a valid phone number, or leave it blank.'); return; }
    setPending(true); setMessage('');
    try {
      const { error } = await supabase.rpc('submit_access_request', {
        p_full_name: value('fullName'),
        p_work_email: value('workEmail'),
        p_company: value('company'),
        p_phone: phone || null,
        p_role: value('role') || null,
        p_message: value('note') || null,
      });
      if (error) {
        setMessage(/submit_access_request.*schema cache|PGRST202/i.test(`${error.code} ${error.message}`)
          ? 'Access requests are not enabled yet. Please contact your Lawcovery relationship manager.'
          : error.message);
        return;
      }
      setSent({ name: value('fullName').split(/\s+/)[0], email: value('workEmail') });
    } catch {
      setMessage('Could not send your request. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="access-sent" role="status">
        <p><strong>Thank you{sent.name ? `, ${sent.name}` : ''}.</strong> We have received your request.</p>
        <p>Our team will review it and get back to you{sent.email ? <> at <strong>{sent.email}</strong></> : ''} shortly.</p>
        <button className="primary-button" type="button" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <form className="access-form" onSubmit={submit}>
      <p>Tell us a little about you and your organisation. Our team will set up your workspace access.</p>
      <div className="access-grid">
        <div className="access-field">
          <label htmlFor="ar-name">Full name</label>
          <div className="input-wrap"><input id="ar-name" name="fullName" autoComplete="name" required minLength={2} maxLength={120} disabled={pending} placeholder="Your name" /></div>
        </div>
        <div className="access-field">
          <label htmlFor="ar-email">Work email</label>
          <div className="input-wrap"><input id="ar-email" name="workEmail" type="email" autoComplete="email" required maxLength={254} disabled={pending} placeholder="you@company.com" /></div>
        </div>
        <div className="access-field">
          <label htmlFor="ar-company">Company</label>
          <div className="input-wrap"><input id="ar-company" name="company" autoComplete="organization" required minLength={2} maxLength={160} disabled={pending} placeholder="Company name" /></div>
        </div>
        <div className="access-field">
          <label htmlFor="ar-phone">Phone <span className="access-optional">(optional)</span></label>
          <div className="input-wrap"><input id="ar-phone" name="phone" type="tel" autoComplete="tel" maxLength={32} disabled={pending} placeholder="+91" /></div>
        </div>
        <div className="access-field access-wide">
          <label htmlFor="ar-role">Role <span className="access-optional">(optional)</span></label>
          <div className="input-wrap"><input id="ar-role" name="role" autoComplete="organization-title" maxLength={120} disabled={pending} placeholder="e.g. Collections manager" /></div>
        </div>
        <div className="access-field access-wide">
          <label htmlFor="ar-note">Anything else? <span className="access-optional">(optional)</span></label>
          <textarea id="ar-note" name="note" rows={3} maxLength={1000} disabled={pending} placeholder="Portfolio size, lender, or what you need access to" />
        </div>
      </div>
      <input className="access-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button className="primary-button" disabled={pending}>{pending ? 'Sending…' : 'Request access'}</button>
      <p role="status" className="status-message">{message}</p>
    </form>
  );
}
