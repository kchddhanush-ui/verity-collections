import { useEffect, useState } from 'react';
import { configurationError, supabase } from './lib/supabase';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(new URLSearchParams(window.location.search).get('mode') === 'recovery');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let observedEvent = false;
    // Keep this callback synchronous; auth methods must run outside it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      observedEvent = true;
      setSession(nextSession);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      // A newer sign-in/sign-out event takes precedence over the initial read.
      if (!observedEvent) setSession(data?.session ?? null);
      if (sessionError) setError('Your session could not be restored. Please sign in again.');
      setLoading(false);
    }).catch(() => {
      if (active) { setLoading(false); setError('Unable to restore your session. Please sign in again.'); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return { session, loading, error, recovering, setRecovering, configurationError };
}
