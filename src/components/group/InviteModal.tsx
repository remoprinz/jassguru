import React, {useState, useEffect} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {QRCodeCanvas} from "qrcode.react"; // Korrigierter Import: QRCodeCanvas
import {Copy} from "lucide-react";
import {useUIStore} from "@/store/uiStore";
import {useAuthStore} from "@/store/authStore";

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
        // ✅ PERSONALISIERTE EINLADUNG - Absender aus AuthStore holen
        const user = useAuthStore.getState().user;
        const inviterName = user?.displayName || user?.email || 'Jemand';
        
        // --- Optimierter Share-Text (PERSONALISIERT) mit Link direkt nach Ankündigung ---
        const titleText = "Du wurdest zu jassguru.ch eingeladen! ✌️";
        const bodyText = `${inviterName} lädt dich ein, der Jassgruppe "${groupName}" beizutreten.`; 
        const linkText = `👉 Hier ist dein Einladungslink:\n${inviteLink}`; 
        const backupText = `💡 Falls du später beitreten möchtest:\n- Melde dich bei jassguru.ch an\n- Füge den kompletten Link ein`;
        const shareText = `${titleText}\n\n${bodyText}\n\n${linkText}\n\n${backupText}`;
        // --- Ende Share-Text ---

        // ✅ KEIN BILD MEHR - Nur Text-basierte Einladung für saubere Link-Vorschau
        const shareData: ShareData = {
          title: `Einladung zur Jassgruppe "${groupName}"`, // Titel als Metadaten
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
      // Fallback, wenn Web Share API nicht unterstützt wird (z.B. Desktop)
      handleCopyLink();
      showNotification({message: "Link kopiert (Teilen nicht direkt unterstützt).", type: "info"});
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        // Nur onClose aufrufen, wenn der Dialog tatsächlich geschlossen werden soll
        if (!open) onClose();
      }}
    >
      <DialogContent 
        className="bg-gray-800 border-gray-700 text-white max-w-sm rounded-xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('#global-notification-container-wrapper')) {
            // Klick war auf Notification Container, verhindere, dass sich das Modal schliesst
            // UND stoppe die weitere Propagation des Events, damit der Klick an die Notification geht.
            event.preventDefault();
            event.stopPropagation();
          }
          // Ansonsten (Klick war auf Modal-Overlay oder ausserhalb) -> Standardverhalten des Dialogs greift (schliesst sich über onOpenChange)
        }}
      >
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
              {/* QR-Code Bereich */}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">QR-Code scannen</h3>
                <p className="text-sm text-gray-400 mb-3">
                  Zeige diesen Code zum direkten Scannen
                </p>
                <div className="bg-white p-2 rounded-lg inline-block">
                  <QRCodeCanvas value={inviteLink} size={256} level="M" />
                </div>
              </div>

              {/* Trennlinie */}
              <div className="flex items-center w-full">
                <div className="flex-1 h-px bg-gray-600"></div>
                <span className="px-3 text-sm text-gray-400">oder</span>
                <div className="flex-1 h-px bg-gray-600"></div>
              </div>

              {/* Link versenden Bereich */}
              <div className="w-full">
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
