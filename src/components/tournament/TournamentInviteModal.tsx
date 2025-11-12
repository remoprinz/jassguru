"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Check, QrCode, Share2 } from 'lucide-react';

// NEU: QRCodeCanvas importieren und QRCodeStyling entfernen
import { QRCodeCanvas } from "qrcode.react"; 

import { generateTournamentInviteToken } from '@/services/tournamentService';
import { useUIStore } from '@/store/uiStore'; // Für Notifications

interface TournamentInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId?: string;
  tournamentName?: string;
  onGenerateNew?: () => void; // Analog zu InviteModal.tsx
}

const APP_BASE_URL = "https://jassguru.ch"; // Immer die korrekte Domain verwenden

const TournamentInviteModal: React.FC<TournamentInviteModalProps> = ({ 
  isOpen, 
  onClose, 
  tournamentId, 
  tournamentName, 
  onGenerateNew // Prop für neuen Link
}) => {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const showNotification = useUIStore((state) => state.showNotification); // showNotification Hook

  useEffect(() => {
    if (isOpen && tournamentId && !inviteLink && !error && !isLoading) {
      const generateLink = async () => {
        setIsLoading(true);
        // setError(null); // Bereits oben, kann bleiben
        try {
          console.log(`[TournamentInviteModal] Attempting to generate token for tournament: ${tournamentId}`);
          const token = await generateTournamentInviteToken(tournamentId);
          
          if (!token) throw new Error("Kein Token erhalten.");
          setInviteLink(`${APP_BASE_URL}/join?tournamentToken=${token}`);
          setHasCopied(false); // Reset copy status on new link
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Einladungslink konnte nicht generiert werden.";
          setError(msg);
          console.error("[TournamentInviteModal] Error generating tournament invite link:", msg);
        }
        setIsLoading(false);
      };
      generateLink();
    }

    if (!isOpen) {
        setInviteLink(null);
        setError(null);
        setIsLoading(false);
        setHasCopied(false);
    }
  }, [isOpen, tournamentId, error, inviteLink, isLoading]);

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setHasCopied(true);
      showNotification({message: "Link kopiert!", type: "success"});
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      showNotification({message: "Fehler beim Kopieren des Links.", type: "error"});
      console.error('Fehler beim Kopieren des Links: ', err);
      // setError("Link konnte nicht in die Zwischenablage kopiert werden."); // Doppelt, da showNotification schon da
    }
  };

  // ✅ Share Funktion IDENTISCH zu InviteModal.tsx (GroupView)
  const handleShare = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        // ✅ PERSONALISIERTE EINLADUNG - Absender aus AuthStore holen
        const { useAuthStore } = await import('@/store/authStore');
        const user = useAuthStore.getState().user;
        const inviterName = user?.displayName || user?.email || 'Jemand';
        
        // ✅ TURNIER-SPEZIFISCHER Share-Text (ohne "später beitreten" etc.)
        const bodyText = `${inviterName} lädt dich zum Jass-Turnier "${tournamentName || 'Jass-Turnier'}" ein.`; 
        const linkText = `👉 Hier ist dein Einladungslink:\n${inviteLink}`;
        const shareText = `${bodyText}\n\n${linkText}`;
        // --- Ende Share-Text ---

        // ✅ KEIN BILD MEHR - Nur Text-basierte Einladung für saubere Link-Vorschau
        const shareData: ShareData = {
          title: `Einladung zum Turnier: ${tournamentName || 'Jass-Turnier'}`, // Titel als Metadaten
          text: shareText,
          // url entfernt, da Link bereits im shareText enthalten ist
        };

        // ✅ KEIN imageFile mehr - dadurch wird die Link-Vorschau kleiner und sauberer
        await navigator.share(shareData);
        console.log("Link erfolgreich geteilt");
      } catch (err) {
        // Share abgebrochen wird nicht als Fehler gewertet
        if ((err as Error).name !== "AbortError") {
          console.error("Fehler beim Teilen: ", err);
          showNotification({message: "Link konnte nicht geteilt werden.", type: "error"});
        }
      }
    } else {
      // ✅ VERBESSERTER DESKTOP-FALLBACK: Kopiere den vollständigen Share-Text (nicht nur den Link)
      try {
        const { useAuthStore } = await import('@/store/authStore');
        const user = useAuthStore.getState().user;
        const inviterName = user?.displayName || user?.email || 'Jemand';
        
        // ✅ TURNIER-SPEZIFISCHER Share-Text (ohne "später beitreten" etc.)
        const bodyText = `${inviterName} lädt dich zum Jass-Turnier "${tournamentName || 'Jass-Turnier'}" ein.`; 
        const linkText = `👉 Hier ist dein Einladungslink:\n${inviteLink}`;
        const shareText = `${bodyText}\n\n${linkText}`;
        
        await navigator.clipboard.writeText(shareText);
        showNotification({message: "Einladungstext kopiert! Du kannst ihn jetzt in WhatsApp, E-Mail oder andere Apps einfügen.", type: "success"});
      } catch (err) {
        console.error("Fehler beim Kopieren des Share-Texts:", err);
        // Fallback: Nur den Link kopieren
      handleCopyLink();
      showNotification({message: "Link kopiert (Teilen nicht direkt unterstützt).", type: "info"});
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  // Interne Funktion zum Triggern von onGenerateNew
  const handleGenerateNew = () => {
    // Zuerst bestehenden Link und Fehler zurücksetzen, damit der useEffect neu triggert
    setInviteLink(null);
    setError(null);
    setIsLoading(false); // loading auch zurücksetzen
    setHasCopied(false);
    if (onGenerateNew) {
      onGenerateNew(); // Externe Funktion aufrufen (falls vorhanden)
    }
    // Der useEffect wird dann erneut versuchen, einen Link zu generieren
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="sm:max-w-md bg-gray-800 border-gray-700 text-white rounded-xl"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('#global-notification-container-wrapper')) {
            // 🔥 BUGFIX: Nur Modal-Schließen verhindern, aber Notification-Klicks erlauben
            event.preventDefault(); // Verhindert Modal-Schließen
            // WICHTIG: stopPropagation() NICHT verwenden, damit Notification-Klicks funktionieren
            return;
          }
        }}
      >
        <DialogHeader className="pt-4">
          <DialogTitle className="text-xl text-white flex items-center justify-center">
            <QrCode className="mr-2 h-5 w-5 text-purple-400" /> Teilnehmer einladen
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center pt-2">
            Teile diesen Link oder QR-Code, um andere Jassfreunde zu deinem Turnier einzuladen.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-purple-400 mb-4" />
            <p className="text-gray-300">Einladungslink wird generiert...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="my-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-center">
            <p>{error}</p>
          </div>
        )}

        {!isLoading && inviteLink && !error && (
          <div className="space-y-4">
            {/* QR-Code Bereich */}
            <div className="flex flex-col items-center space-y-3 py-4">
              <h3 className="text-lg font-semibold text-white mb-2">QR-Code scannen</h3>
              <p className="text-sm text-gray-400 mb-3">
                Zeige diesen Code zum direkten Scannen
              </p>
              <div className="bg-white p-2 rounded-lg inline-block shadow-md">
                <QRCodeCanvas value={inviteLink} size={256} level="M" />
              </div>
            </div>

            {/* Trennlinie */}
            <div className="flex items-center w-full px-4">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="px-3 text-sm text-gray-400">oder</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>

            {/* Link versenden Bereich - EXAKT WIE BEI GRUPPEN */}
            <div className="w-full px-4">
              <h3 className="text-lg font-semibold text-white mb-2 text-center">Einladungslink versenden</h3>
              <p className="text-sm text-gray-400 mb-3 text-center">
                Teile diesen Link über WhatsApp, E-Mail oder andere Apps
              </p>
              
              <div className="relative w-full mb-3">
                  <Input 
                  type="text"
                    readOnly 
                  value={inviteLink}
                  className="bg-gray-700 border-gray-600 text-gray-300 pr-10 text-xs"
                  />
                  <Button 
                  variant="ghost"
                    size="icon" 
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-600"
                    onClick={handleCopyLink} 
                  aria-label="Link kopieren"
                  >
                  <Copy size={16}/>
                  </Button>
              </div>

              <Button
                onClick={handleShare}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="default"
              >
                Einladung versenden
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-col sm:justify-center pt-4 gap-2 px-4">
          {/* Button zum Generieren eines neuen Links (optional) - jetzt Gelb, kommt als zweites */}
          {onGenerateNew && inviteLink && !isLoading && (
                <Button
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={handleGenerateNew}
                  size="default"
                >
                  Neuen Code generieren
                </Button>
              )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TournamentInviteModal; 