/**
 * Refresht den JVS-Membership-Status wenn die App in den Vordergrund kommt.
 * So sieht der User seinen Badge sofort nach der Zahlung, ohne sich neu einloggen zu müssen.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export function useJvsMembershipRefresh() {
  const status = useAuthStore((s) => s.status);
  const refreshJvsMembership = useAuthStore((s) => s.refreshJvsMembership);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshJvsMembership();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status, refreshJvsMembership]);
}
