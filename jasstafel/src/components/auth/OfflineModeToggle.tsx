"use client";

import {useState, useEffect} from "react";
import {useAuthStore} from "@/store/authStore";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {FaWifi} from "react-icons/fa";
import {MdWifiOff} from "react-icons/md";
import {LuUserCog} from "react-icons/lu";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {useLocalAuth} from "@/services/firebaseInit";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";

export function OfflineModeToggle() {
  const {appMode, setAppMode} = useAuthStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isLocalDev, setIsLocalDev] = useState(false);
  const [showApiBlockedWarning, setShowApiBlockedWarning] = useState(false);
  const [isLocalAuthEnabled, setIsLocalAuthEnabled] = useState(false);

  const localAuth = useLocalAuth();

  useEffect(() => {
    setIsLocalDev(window.location.hostname === "localhost");
    setIsLocalAuthEnabled(localAuth);

    // Prüfe, ob die App im lokalen Modus ist und die API vorher blockiert wurde
    const hasApiBlockedError = sessionStorage.getItem("firebase-auth-blocked") === "true";
    setShowApiBlockedWarning(hasApiBlockedError);
  }, [localAuth]);

  const isOffline = appMode === "offline";

  const handleToggleChange = (checked: boolean) => {
    const newMode = checked ? "offline" : "online";

    // Wenn wir in den Offline-Modus wechseln, zeigen wir einen Bestätigungsdialog
    if (newMode === "offline") {
      setShowConfirmDialog(true);
    } else {
      // Kein Dialog nötig, wenn wir zurück in den Online-Modus wechseln
      setAppMode(newMode);
    }
  };

  const confirmOfflineMode = () => {
    setAppMode("offline");
    setShowConfirmDialog(false);
  };

  return (
    <>
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOffline ? <MdWifiOff className="text-gray-500" /> : <FaWifi className="text-green-500" />}
            <Switch
              checked={isOffline}
              onCheckedChange={handleToggleChange}
              id="offline-mode"
            />
            <Label htmlFor="offline-mode" className="text-sm">
              {isOffline ? "Offline-Modus aktiv" : "Online-Modus aktiv"}
            </Label>
          </div>

          {isLocalAuthEnabled && !isOffline && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-sm text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                    <LuUserCog className="mr-1" />
                    <span>Lokale Auth</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Lokale Authentifizierung ist aktiviert. <br/>Keine Firebase-Verbindung erforderlich.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {isLocalDev && !isOffline && !isLocalAuthEnabled && (
          <Alert className="bg-amber-50 text-amber-800 border-amber-200 text-xs p-2">
            <AlertDescription>
              Im Entwicklungsmodus ist der Offline-Modus oft stabiler.
            </AlertDescription>
          </Alert>
        )}

        {isLocalDev && isOffline && (
          <Alert className="bg-amber-50 text-amber-800 border-amber-200 text-xs p-2">
            <AlertDescription>
              Lokale Entwicklung im Offline-Modus. Verwende die lokale Entwicklungsanmeldung.
            </AlertDescription>
          </Alert>
        )}

        {isLocalAuthEnabled && !isOffline && (
          <Alert className="bg-green-50 text-green-800 border-green-200 text-xs p-2">
            <AlertDescription>
              Lokale Authentifizierung ist aktiviert. Firebase API wird nicht verwendet.
            </AlertDescription>
          </Alert>
        )}

        {showApiBlockedWarning && !isOffline && !isLocalAuthEnabled && (
          <Alert className="bg-red-50 text-red-800 border-red-200 text-xs p-2">
            <AlertDescription>
              Firebase API wurde blockiert. Wechsle zum Offline-Modus!
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>In den Offline-Modus wechseln?</DialogTitle>
            <DialogDescription>
              Im Offline-Modus werden Ihre Daten lokal auf diesem Gerät gespeichert.
              Sie können später zum Online-Modus zurückkehren, um Ihre Daten zu synchronisieren.
              {isLocalDev && (
                <p className="mt-2 text-amber-600">
                  <strong>Hinweis:</strong> In der lokalen Entwicklungsumgebung ist der Offline-Modus besonders nützlich,
                  da er ohne Verbindung zur Firebase-API funktioniert.
                </p>
              )}
              {isLocalAuthEnabled && (
                <p className="mt-2 text-green-600">
                  <strong>Hinweis:</strong> Die lokale Authentifizierung ist bereits aktiviert.
                  Der Offline-Modus bietet zusätzlich lokale Datenspeicherung.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={confirmOfflineMode}>
              Zum Offline-Modus wechseln
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
