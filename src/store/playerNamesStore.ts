// Globaler, Realtime-aktualisierter Cache: playerId → displayName.
//
// Zweck: Spielernamen werden in vielen Snapshots der DB denormalisiert
// gespeichert (playerComputedStats, jassGameSummaries, aggregated/chartData_*,
// players/{pid}/partnerStats etc.). Beim Rename eines Spielers laufen diese
// Snapshots auseinander. Statt jede Snapshot-Stelle bei jedem Rename per
// Cloud Function zu pflegen, halten wir im Frontend eine *aktuelle* Map und
// rendern Namen immer per ID über `resolveName(id, fallback)`. Der Snapshot
// dient nur noch als Fallback.
//
// Quelle: onSnapshot-Query auf `players where groupIds array-contains-any
// [userGroupIds]`. Damit deckt der Cache alle Spieler ab, die der eingeloggte
// User in seinen Gruppen sehen kann — und reagiert live (mid-game!) auf
// Umbenennungen.

import { create } from "zustand";
import { collection, onSnapshot, query, where, Unsubscribe, DocumentData } from "firebase/firestore";
import { db } from "@/services/firebaseInit";
import { PLAYERS_COLLECTION } from "@/constants/firestore";

interface PlayerNamesState {
  nameById: Map<string, string>;
  /** Tickt jedes Mal hoch, wenn die Map sich ändert — für useSyncExternalStore-style Hooks. */
  version: number;
  /** Aktive Subscriptions (gechunkt, weil Firestore "array-contains-any" max. 30 Werte erlaubt). */
  _unsubs: Unsubscribe[];

  /** Manuelles Hinzufügen — z.B. nach `getGroupMembersOptimized`, damit Render-Stellen sofort frische Namen haben, ohne auf den ersten Snapshot zu warten. */
  hydrateFromPlayers: (players: Array<{ id?: string; userId?: string | null; displayName?: string | null }>) => void;

  /** Einzelnen Eintrag setzen (z.B. nach Profil-Rename des eigenen Users). */
  setName: (id: string, name: string) => void;

  /** Realtime-Subscription auf players-Collection für die übergebenen groupIds einrichten. Idempotent (re-runs ersetzen alte Subs). */
  subscribeToGroups: (groupIds: string[]) => void;

  /** Alle Subscriptions abbauen (Logout). */
  clear: () => void;
}

const FIRESTORE_IN_LIMIT = 30; // array-contains-any cap

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const usePlayerNamesStore = create<PlayerNamesState>((set, get) => ({
  nameById: new Map(),
  version: 0,
  _unsubs: [],

  hydrateFromPlayers: (players) => {
    if (!players || players.length === 0) return;
    const next = new Map(get().nameById);
    let changed = false;
    for (const p of players) {
      const name = p?.displayName;
      if (!name) continue;
      if (p.id && next.get(p.id) !== name) { next.set(p.id, name); changed = true; }
      if (p.userId && next.get(p.userId) !== name) { next.set(p.userId, name); changed = true; }
    }
    if (changed) set({ nameById: next, version: get().version + 1 });
  },

  setName: (id, name) => {
    if (!id || !name) return;
    const next = new Map(get().nameById);
    if (next.get(id) === name) return;
    next.set(id, name);
    set({ nameById: next, version: get().version + 1 });
  },

  subscribeToGroups: (groupIds) => {
    // Vorherige Subs abbauen
    get()._unsubs.forEach((u) => { try { u(); } catch {} });
    if (!db || !groupIds || groupIds.length === 0) {
      set({ _unsubs: [] });
      return;
    }
    const newUnsubs: Unsubscribe[] = [];
    const playersRef = collection(db, PLAYERS_COLLECTION);
    for (const part of chunk(groupIds, FIRESTORE_IN_LIMIT)) {
      const q = query(playersRef, where("groupIds", "array-contains-any", part));
      const unsub = onSnapshot(
        q,
        (snap) => {
          // Update aller geänderten Docs in einem einzigen set()
          const next = new Map(get().nameById);
          let changed = false;
          snap.docChanges().forEach((ch) => {
            const data = ch.doc.data() as DocumentData;
            const name = typeof data?.displayName === "string" ? data.displayName : null;
            if (!name) return;
            if (ch.type === "removed") return; // wir lassen vorhandene Namen drin — Snapshot in DB ist eh Fallback
            if (next.get(ch.doc.id) !== name) { next.set(ch.doc.id, name); changed = true; }
            if (data?.userId && next.get(data.userId) !== name) { next.set(data.userId, name); changed = true; }
          });
          if (changed) set({ nameById: next, version: get().version + 1 });
        },
        (err) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[playerNamesStore] subscription error:", err?.message || err);
          }
        }
      );
      newUnsubs.push(unsub);
    }
    set({ _unsubs: newUnsubs });
  },

  clear: () => {
    get()._unsubs.forEach((u) => { try { u(); } catch {} });
    set({ nameById: new Map(), version: 0, _unsubs: [] });
  },
}));

/**
 * Plain function (kein Hook). Für non-React-Code (z.B. utils, Services).
 * In React-Komponenten besser `useResolvedName` nutzen, sonst kein Re-Render bei Rename.
 */
export function resolveName(id?: string | null, fallback?: string | null): string {
  if (!id) return fallback || "Unbekannt";
  const map = usePlayerNamesStore.getState().nameById;
  return map.get(id) || fallback || "Unbekannt";
}
