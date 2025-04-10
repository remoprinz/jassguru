import React, {useState, useEffect} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {QRCodeCanvas} from "qrcode.react"; // Korrigierter Import: QRCodeCanvas
import {Copy, Share2} from "lucide-react";
import {useUIStore} from "@/store/uiStore";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  inviteToken: string | null;
  groupName: string;
  onGenerateNew?: () => void; // Optional: Callback für neuen Link
}

// --- App Base URL KORRIGIERT --- 
const APP_BASE_URL = "https://jassguru.ch"; // Direkt setzen, um Umgebungsvariablen zu überschreiben

const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  error,
  inviteToken,
  groupName,
  onGenerateNew,
}) => {
  const showNotification = useUIStore((state) => state.showNotification);
  const [inviteLink, setInviteLink] = useState<string>("");

  useEffect(() => {
    if (inviteToken) {
      setInviteLink(`${APP_BASE_URL}/join?token=${inviteToken}`);
    } else {
      setInviteLink("");
    }
  }, [inviteToken]);

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      showNotification({message: "Link kopiert!", type: "success"});
    } catch (err) {
      showNotification({message: "Fehler beim Kopieren des Links.", type: "error"});
      console.error("Failed to copy link: ", err);
    }
  };

  const handleShare = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        // --- Angepasster Share-Text (NEUE STRUKTUR - OHNE SLOGAN) ---
        const titleText = "**Du wurdest zu Jassguru eingeladen**";
        const bodyText = `Tritt der Jassgruppe '${groupName}' bei.`; 
        const linkText = `👉 Hier beitreten: ${inviteLink}`;
        const shareText = `${titleText}\n\n${bodyText}\n\n${linkText}`; // Slogan entfernt
        // --- Ende Share-Text ---

        // --- Bild laden: Immer /welcome-guru.png verwenden (Logik hinzugefügt) ---
        let imageFile: File | null = null;
        try {
          const response = await fetch('/welcome-guru.png');
          if (response.ok) {
            const blob = await response.blob();
            imageFile = new File([blob], 'welcome-guru.png', { type: blob.type || 'image/png' });
            console.log("Modal: Standardbild für Teilen geladen.");
          } else {
            console.error("Modal: Standardbild konnte nicht geladen werden:", response.statusText);
          }
        } catch (fetchError) {
          console.error("Modal: Fehler beim Laden des Standardbildes:", fetchError);
        }
        // --- Ende Bild laden ---

        const shareData: ShareData = {
          title: `Du wurdest zu Jassguru eingeladen`, // Titel als Metadaten
          text: shareText,
          url: inviteLink, // URL bleibt wichtig
        };

        // Bild hinzufügen, falls vorhanden und unterstützt
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          shareData.files = [imageFile];
          console.log("Modal: Versuche Teilen mit Bild.");
        } else {
          console.log("Modal: Bild nicht verfügbar oder Teilen von Files nicht unterstützt.");
        }

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
      // Fallback, wenn Web Share API nicht unterstützt wird (z.B. Desktop)
      handleCopyLink();
      showNotification({message: "Link kopiert (Teilen nicht direkt unterstützt).", type: "info"});
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl pt-4">
            Zur Gruppe einladen
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 flex flex-col items-center space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-48">
              <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
              <p className="mt-2 text-gray-400">Einladungscode wird generiert...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="text-red-400 text-center h-48 flex flex-col justify-center">
              <p>Fehler beim Generieren:</p>
              <p className="text-sm">{error}</p>
              {/* Optional Button zum erneuten Versuch */}
            </div>
          )}

          {inviteLink && !isLoading && !error && (
            <>
              <p className="text-sm text-gray-400 text-center">
                QR Code zum Scannen zeigen oder per Link einladen:
              </p>
              <div className="bg-white p-2 rounded-lg inline-block">
                <QRCodeCanvas value={inviteLink} size={192} level="M" />
              </div>
              <div className="relative w-full">
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
                 Einladen mit Link
              </Button>
            </>
          )}
        </div>

        <DialogFooter 
          className="flex flex-col sm:flex-col sm:justify-center pt-4 gap-2"
        >
          {/* Button zum Generieren eines neuen Links (optional) - jetzt Gelb, kommt als zweites */}
          {onGenerateNew && inviteLink && !isLoading && (
            <Button
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={onGenerateNew}
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

export default InviteModal;
