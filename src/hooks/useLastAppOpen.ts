import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';
import { useAuthStore } from '@/store/authStore';

const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Schreibt `lastAppOpen` (serverTimestamp) ins User-Dokument bei App-Start
 * und wenn die App aus dem Hintergrund nach vorne kommt. Throttled auf 5 Min,
 * um bei rapider Tab-Switcherei keine Schreiblawine zu produzieren.
 *
 * Nur für eingeloggte (Nicht-Gast) User.
 */
export function useLastAppOpen() {
  const lastWriteRef = useRef<number>(0);

  useEffect(() => {
    const writeIfDue = async () => {
      const state = useAuthStore.getState();
      const uid = state.user?.uid;
      if (!uid || state.isGuest || state.status !== 'authenticated') return;
      if (!db) return;

      const now = Date.now();
      if (now - lastWriteRef.current < THROTTLE_MS) return;
      lastWriteRef.current = now;

      try {
        await setDoc(
          doc(db, 'users', uid),
          { lastAppOpen: serverTimestamp() },
          { merge: true }
        );
      } catch {
        // Stillschweigend ignorieren — Tracking darf die App nie brechen.
      }
    };

    void writeIfDue();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void writeIfDue();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
