import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before timeout

export function useSessionTimeout() {
  const router = useRouter();
  const inactivityTimerRef = useRef<NodeJS.Timeout>();
  const warningTimerRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    // Clear activity cookie
    document.cookie = 'last-activity=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    // Force hard navigation to clear state
    window.location.href = '/auth/login';
  }, [router]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timers
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    // Set warning timer (5 minutes before timeout)
    warningTimerRef.current = setTimeout(() => {
      toast.error('Your session will expire in 5 minutes due to inactivity. Interagisci per rinnovare la sessione.', {
        duration: 10000,
      });
    }, INACTIVITY_TIMEOUT - WARNING_TIME);

    // Set logout timer
    inactivityTimerRef.current = setTimeout(() => {
      toast.error('Session expired due to inactivity');
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [logout]);

  useEffect(() => {
    // Add event listeners for user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetTimer();
    };

    // Initialize timer
    resetTimer();

    // Add listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetTimer]);
}
