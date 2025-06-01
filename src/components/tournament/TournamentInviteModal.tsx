"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
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

  // Share Funktion analog zu InviteModal.tsx
  const handleShare = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        const titleText = `**Du wurdest zum Jass-Turnier \"${tournamentName || 'Jass-Turnier'}\" eingeladen!**`;
        const bodyText = `Nimm am Turnier teil und zeige dein Können.`;
        const linkText = `👉 Hier beitreten: ${inviteLink}`;
        const shareText = `${titleText}\n\n${bodyText}\n\n${linkText}`;

        const shareData: ShareData = {
          title: `Einladung zum Turnier: ${tournamentName || 'Jass-Turnier'}`,
          text: shareText,
          url: inviteLink,
        };
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          showNotification({message: "Link konnte nicht geteilt werden.", type: "error"});
        }
      }
    } else {
      handleCopyLink();
      showNotification({message: "Link kopiert (Teilen nicht direkt unterstützt).", type: "info"});
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
            event.preventDefault();
            event.stopPropagation();
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
            <div className="flex flex-col items-center space-y-3 py-4">
              <div className="bg-white p-2 rounded-lg inline-block shadow-md">
                <QRCodeCanvas value={inviteLink} size={256} level="M" />
              </div>
            </div>
            <div className="px-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-link" className="text-gray-300 sr-only">Einladungslink</Label>
                <div className="flex items-center space-x-2">
                  <Input 
                    id="invite-link" 
                    value={inviteLink.replace(/^https?:\/\/[^/]+/, '').replace(/\?tournamentToken=.*$/, '')} 
                    readOnly 
                    className="bg-gray-700 border-gray-600 text-gray-300 text-xs pr-10" 
                  />
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="ghost" 
                    onClick={handleCopyLink} 
                    className="border-gray-600 hover:bg-gray-700/50 text-gray-400 hover:text-white h-9 w-9"
                  >
                    {hasCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleShare}
                className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center"
                size="default"
              >
                <Share2 size={16} className="mr-2"/> Link teilen
              </Button>
              {onGenerateNew && (
                <Button
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
                  onClick={handleGenerateNew}
                  size="default"
                >
                  Neuen Code generieren
                </Button>
              )}
              <DialogClose asChild>
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={onClose} 
                  className="w-full"
                >
                  Schliessen
                </Button>
              </DialogClose>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TournamentInviteModal; 