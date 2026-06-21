import { useEffect, useRef, useState } from "react";
import { serverTimestamp } from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";
import { updateUserDocument } from "@/services/authService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Einmaliges Willkommen für frisch verknüpfte JVS-Mitglieder.
 *
 * Zeigt sich, sobald ein eingeloggter Nutzer eine AKTIVE JVS-Mitgliedschaft hat
 * und das Welcome noch nie gesehen wurde. Der "gesehen"-Status wird persistent
 * auf users/{uid}.jvsWelcomeSeenAt gespeichert (überlebt Reinstall/Gerätewechsel).
 *
 * Bewusst unabhängig vom Passwort-Reset-Flow (Option B) — funktioniert egal,
 * ob das Passwort über den gebrandeten /auth/action-Handler oder Firebases
 * Default-Seite gesetzt wurde.
 */
export function JvsWelcome() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isGuest = useAuthStore((s) => s.isGuest);
  const jvsMembership = useAuthStore((s) => s.jvsMembership);
  const refreshJvsMembership = useAuthStore((s) => s.refreshJvsMembership);

  const [dismissed, setDismissed] = useState(false);
  const refreshedRef = useRef(false);

  const isLoggedIn = status === "authenticated" && !!user && !isGuest;

  // Mitgliedschaft nachladen, falls beim Reload noch nicht geholt wurde
  // (der initAuth-Listener fetcht jvsMembership nicht selbst).
  useEffect(() => {
    if (isLoggedIn && jvsMembership === null && !refreshedRef.current) {
      refreshedRef.current = true;
      void refreshJvsMembership();
    }
  }, [isLoggedIn, jvsMembership, refreshJvsMembership]);

  const isActiveMember = !!jvsMembership?.isMember && !jvsMembership?.expired;
  const alreadySeen = !!user?.jvsWelcomeSeenAt;
  const open = isLoggedIn && isActiveMember && !alreadySeen && !dismissed;

  const handleClose = () => {
    setDismissed(true);
    const uid = user?.uid;
    if (uid) {
      void updateUserDocument(uid, { jvsWelcomeSeenAt: serverTimestamp() }).catch(() => {
        /* nicht kritisch — Welcome wird beim nächsten Mal halt nochmal gezeigt */
      });
    }
  };

  if (!open) return null;

  const memberNumber = jvsMembership?.memberNumber;
  const season = jvsMembership?.season;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl pt-2">
            Willkommen im Jassverband! 🎉
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-center text-sm text-gray-200">
          {memberNumber ? (
            <p className="text-base">
              Du bist jetzt <strong>JVS-Mitglied #{memberNumber}</strong>
              {season ? <> · Saison {season}</> : null}.
            </p>
          ) : (
            <p className="text-base">Deine JVS-Mitgliedschaft ist aktiv.</p>
          )}
          <p>
            Damit ist <strong>JassGuru Pro</strong> freigeschaltet: eigene Gruppen
            gründen, Turniere spielen und an der Schweizermeisterschaft teilnehmen.
          </p>
          <p className="text-gray-400">Viel Spass — und schöni Charte!</p>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            Los geht&apos;s
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
