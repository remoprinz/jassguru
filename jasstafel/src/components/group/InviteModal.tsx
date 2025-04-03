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

// Ersetze dies mit deiner tatsächlichen App-URL
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://jasstafel.jassguru.ch";

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
        await navigator.share({
          title: `Einladung zur Jassgruppe '${groupName}'`,
          text: `Tritt meiner Jassgruppe '${groupName}' auf Jassguru bei!`,
          url: inviteLink,
        });
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
          <DialogTitle className="text-center text-xl">
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
                Zeige diesen Code zum Scannen oder teile den Link:
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
                className="w-full bg-green-600 hover:bg-green-700 flex items-center gap-2 text-white"
              >
                <Share2 size={18} /> Link teilen
              </Button>
            </>
          )}
        </div>

        <DialogFooter className="flex flex-col space-y-2 pt-4 border-t border-gray-700">
          {/* Button zum Generieren eines neuen Links (optional) - jetzt Gelb */}
          {onGenerateNew && inviteLink && !isLoading && (
            <Button
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={onGenerateNew}
            >
               Neuen Code generieren
            </Button>
          )}
          {/* Schliessen Button - jetzt Rot und Text angepasst */}
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            onClick={onClose}
          >
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteModal;
