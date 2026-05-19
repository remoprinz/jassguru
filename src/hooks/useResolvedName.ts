// Hook für Render-Komponenten: aktueller Spielername per ID.
// Reagiert live auf Renames (Realtime-Subscription via playerNamesStore).

import { usePlayerNamesStore } from "@/store/playerNamesStore";

/**
 * Gibt den aktuellen displayName eines Spielers zurück, ggf. mit Fallback.
 * Triggert Re-Render, wenn der Name sich ändert (über version-Selector).
 */
export function useResolvedName(id?: string | null, fallback?: string | null): string {
  // version als Trigger; nameById als Quelle. Zwei separate Selectors halten
  // Re-Renders minimal (nur wenn ID-spezifischer Name sich ändert würde noch
  // besser sein — aber Map-Selector wäre teurer als version-Trigger).
  const name = usePlayerNamesStore((s) => (id ? s.nameById.get(id) : undefined));
  return name || fallback || "Unbekannt";
}
