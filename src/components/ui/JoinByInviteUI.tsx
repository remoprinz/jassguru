"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { QrCode, XIcon, AlertTriangle, RefreshCw } from "lucide-react";
import jsQR from "jsqr";

// Konstanten
const MAX_RETRY_ATTEMPTS = 3;

interface JoinByInviteUIProps {
  onProcessInput: (inputValue: string) => void;
  isLoading: boolean;
  inviteType: "group" | "tournament";
  showNotification?: (notification: { message: string; type: "success" | "error" | "info" }) => void;
}

const JoinByInviteUI: React.FC<JoinByInviteUIProps> = ({ 
  onProcessInput, 
  isLoading: isProcessingInput,
  inviteType, 
  showNotification 
}) => {
  const [manualToken, setManualToken] = useState<string>("");
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingQrImage, setProcessingQrImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let originalBodyPointerEvents: string | null = null;
    let originalBodyTouchAction: string | null = null;
    let timerId: NodeJS.Timeout | null = null;

    if (showScannerModal) {
      originalBodyPointerEvents = document.body.style.pointerEvents;
      originalBodyTouchAction = document.body.style.touchAction;

      document.body.style.pointerEvents = 'auto';
      document.body.style.touchAction = 'auto';

      timerId = setTimeout(() => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.touchAction = 'auto';
      }, 300);

      return () => {
        if (timerId) clearTimeout(timerId);
        if (originalBodyPointerEvents !== null) document.body.style.pointerEvents = originalBodyPointerEvents;
        if (originalBodyTouchAction !== null) document.body.style.touchAction = originalBodyTouchAction;
      };
    }
  }, [showScannerModal]);

  const closeModal = useCallback(() => {
    setShowScannerModal(false);
    setCameraError(null);
    setProcessingQrImage(false);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, []);

  const handleManualSubmit = () => {
    if (manualToken.trim()) {
      onProcessInput(manualToken.trim());
      setManualToken("");
    }
  };

  const openCamera = () => {
    setCameraError(null);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setProcessingQrImage(true);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imageDataUrl = e.target?.result as string;
        if (!imageDataUrl) {
          throw new Error("Bild konnte nicht geladen werden.");
        }

        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          
          console.log("Parent: Originalbild-Dimensionen:", image.width, "x", image.height);

          const MAX_DIMENSION = 1000; // Maximale Dimension für die Skalierung
          let { width, height } = image;

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height / width) * MAX_DIMENSION);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width / height) * MAX_DIMENSION);
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            console.error("Parent: Canvas Kontext konnte nicht erstellt werden.");
            throw new Error("Canvas Kontext konnte nicht erstellt werden.");
          }
          ctx.drawImage(image, 0, 0, width, height); // Bild skaliert zeichnen
          const imageData = ctx.getImageData(0, 0, width, height);
          
          console.log("Parent: Bilddaten für jsQR vorbereitet. Skalierte Canvas-Dimensionen:", canvas.width, "x", canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });

          console.log("Parent: Ergebnis von jsQR (erster Versuch):", code);

          if (code && code.data) {
            console.log("Parent: QR-Code erfolgreich dekodiert (erster Versuch):", code.data);
            if (showNotification) showNotification({ message: "QR-Code erfolgreich gescannt!", type: "success" });
            
            let tokenValue = code.data;
            try {
              if (tokenValue.includes("token=")) {
                const url = new URL(tokenValue);
                const parsedToken = url.searchParams.get("token");
                if (parsedToken) {
                  tokenValue = parsedToken;
                }
              }
            } catch (parseError) {
              console.info("Parent: QR-Code war keine URL mit Token, verwende Rohtext (erster Versuch).", parseError);
            }
            onProcessInput(tokenValue);
            closeModal();
          } else if (code && code.location) {
            console.log("Parent: QR-Muster erkannt, aber nicht dekodiert. Versuche Zoom-Strategie...");

            const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = code.location;
            const minX = Math.min(topLeftCorner.x, bottomLeftCorner.x);
            const maxX = Math.max(topRightCorner.x, bottomRightCorner.x);
            const minY = Math.min(topLeftCorner.y, topRightCorner.y);
            const maxY = Math.max(bottomLeftCorner.y, bottomRightCorner.y);

            const qrWidth = maxX - minX;
            const qrHeight = maxY - minY;

            if (qrWidth > 0 && qrHeight > 0) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = qrWidth;
              tempCanvas.height = qrHeight;
              const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

              if (!tempCtx) {
                console.error("Parent: Konnte temporären Canvas Kontext für Zoom nicht erstellen.");
                setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
                if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
                setShowScannerModal(true);
                return;
              }
              
              // Zeichne den erkannten QR-Code-Bereich vom skalierten Bild (canvas) auf das tempCanvas
              tempCtx.drawImage(canvas, minX, minY, qrWidth, qrHeight, 0, 0, qrWidth, qrHeight);

              const zoomedCanvas = document.createElement('canvas');
              let newZoomedWidth = qrWidth;
              let newZoomedHeight = qrHeight;
              const aspectRatio = qrWidth / qrHeight;

              // Skaliere den Ausschnitt so, dass die längere Seite MAX_DIMENSION entspricht
              if (qrWidth > qrHeight) {
                newZoomedWidth = MAX_DIMENSION;
                newZoomedHeight = MAX_DIMENSION / aspectRatio;
              } else {
                newZoomedHeight = MAX_DIMENSION;
                newZoomedWidth = MAX_DIMENSION * aspectRatio;
              }
              newZoomedWidth = Math.round(newZoomedWidth);
              newZoomedHeight = Math.round(newZoomedHeight);
              
              // Stelle sicher, dass Dimensionen nicht 0 sind
              if (newZoomedWidth <= 0 || newZoomedHeight <=0) {
                 console.warn("Parent: Zoomed Dimensionen sind 0 oder negativ, breche Zoom ab.", newZoomedWidth, newZoomedHeight);
                 setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
                 if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
                 setShowScannerModal(true);
                 return;
              }


              zoomedCanvas.width = newZoomedWidth;
              zoomedCanvas.height = newZoomedHeight;
              const zoomedCtx = zoomedCanvas.getContext('2d', { willReadFrequently: true });

              if (!zoomedCtx) {
                console.error("Parent: Konnte gezoomten Canvas Kontext nicht erstellen.");
                setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
                if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
                setShowScannerModal(true);
                return;
              }

              console.log(`Parent: Zoome QR-Code-Ausschnitt von ${qrWidth}x${qrHeight} auf ${newZoomedWidth}x${newZoomedHeight}`);
              zoomedCtx.drawImage(tempCanvas, 0, 0, qrWidth, qrHeight, 0, 0, newZoomedWidth, newZoomedHeight);
              
              const zoomedImageData = zoomedCtx.getImageData(0, 0, newZoomedWidth, newZoomedHeight);
              const zoomedCode = jsQR(zoomedImageData.data, zoomedImageData.width, zoomedImageData.height, {
                inversionAttempts: "attemptBoth",
              });

              console.log("Parent: Ergebnis von jsQR (nach Zoom):", zoomedCode);

              if (zoomedCode && zoomedCode.data) {
                console.log("Parent: QR-Code erfolgreich nach Zoom dekodiert:", zoomedCode.data);
                if (showNotification) showNotification({ message: "QR-Code erfolgreich gescannt (nach Zoom)!", type: "success" });
                
                let tokenValue = zoomedCode.data;
                 try {
                  if (tokenValue.includes("token=")) {
                    const url = new URL(tokenValue);
                    const parsedToken = url.searchParams.get("token");
                    if (parsedToken) {
                      tokenValue = parsedToken;
                    }
                  }
                } catch (parseError) {
                  console.info("Parent: QR-Code war keine URL mit Token, verwende Rohtext (nach Zoom).", parseError);
                }
                onProcessInput(tokenValue);
                closeModal();
              } else {
                console.log("Parent: QR-Code auch nach Zoom nicht dekodierbar.");
                setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
                if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
                setShowScannerModal(true);
              }
            } else {
              console.log("Parent: QR-Code-Position hatte ungültige Dimensionen nach Erkennung.");
              setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
              if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
              setShowScannerModal(true);
            }
          } else {
            setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
            if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
            setShowScannerModal(true);
          }
        };
        image.onerror = () => {
          setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
          if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
          setShowScannerModal(true);
          console.error("Parent: Fehler beim Laden der Bilddatei in Image-Objekt.");
        };
        image.src = imageDataUrl;
      } catch (error: any) {
        console.error("Parent: Fehler bei der QR-Code-Verarbeitung:", error);
        setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
        if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
        setShowScannerModal(true);
      } finally {
        setProcessingQrImage(false);
        if (event.target) {
            event.target.value = "";
        }
      }
    };
    reader.onerror = () => {
        setCameraError("Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!");
        if (showNotification) showNotification({ message: "Der Scanner ist je nach Smartphone manchmal unzuverlässig. Setze einfach hier den Einladungslink ein!", type: "info" });
        setProcessingQrImage(false);
        setShowScannerModal(true);
        console.error("Parent: Fehler beim Lesen der Datei mit FileReader.");
         if (event.target) {
            event.target.value = "";
        }
    };
    reader.readAsDataURL(file);
  };

  const UILabels = {
    group: {
      title: "Einer Gruppe beitreten",
      inputPlaceholder: "Einladungscode hier einfügen",
      joinButton: "Gruppe beitreten",
      scanButton: "QR-Code der Gruppe scannen (Foto)",
      modalTitle: "QR-Code Scan Status",
      modalDescription: "Ergebnis des QR-Code Scans.",
    },
    tournament: {
      title: "An Turnier teilnehmen",
      inputPlaceholder: "Einladungscode hier einfügen",
      joinButton: "Turnier beitreten",
      scanButton: "QR-Code des Turniers scannen (Foto)",
      modalTitle: "QR-Code Scan Status",
      modalDescription: "Ergebnis des QR-Code Scans.",
    },
  };

  const labels = UILabels[inviteType];

  return (
    <div className="my-4 p-4 border border-gray-700 rounded-lg bg-gray-800/50">
      <h3 className="text-lg font-semibold text-white mb-3">{labels.title}</h3>
      <div className="space-y-3">
        <Input
          type="text"
          placeholder={labels.inputPlaceholder}
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          className="w-full bg-gray-700 border-gray-600 text-white focus:border-gray-500"
          disabled={isProcessingInput || processingQrImage}
        />
        <Button
          onClick={handleManualSubmit}
          disabled={isProcessingInput || processingQrImage || !manualToken.trim()}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {isProcessingInput ? "Wird verarbeitet..." : labels.joinButton}
        </Button>
        
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          onChange={handleImageCapture}
          style={{ display: 'none' }}
          disabled={processingQrImage}
        />

        <Button
          onClick={openCamera}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center"
          disabled={isProcessingInput || processingQrImage}
        >
          <QrCode size={18} className="mr-2" />
          {processingQrImage ? "Verarbeite Bild..." : labels.scanButton}
        </Button>
      </div>

      {showScannerModal && (
        <Dialog open={showScannerModal} onOpenChange={(isOpen) => {
          if (!isOpen) closeModal();
        }}>
          <DialogContent 
            className="bg-gray-800 border-gray-700 text-white sm:max-w-md overflow-hidden"
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('#global-notification-container-wrapper')) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center">
                {cameraError ? <AlertTriangle size={20} className="mr-2 text-red-400" /> : <QrCode size={20} className="mr-2 text-purple-400" /> }
                {labels.modalTitle}
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                {labels.modalDescription}
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 min-h-[100px] flex flex-col items-center justify-center">
              {cameraError ? (
                <div className="text-center p-4 bg-red-900/30 rounded-lg border border-red-700/50 w-full">
                  <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                  <p className="text-red-200 mb-2">{cameraError}</p>
                </div>
              ) : (
                <div className="text-center p-4">
                  <p className="text-green-300">QR-Code wird verarbeitet...</p>
                </div>
              )}
              
              <p className="text-xs text-gray-400 mt-3 text-center">
                {processingQrImage ? "Bild wird analysiert..." : cameraError ? "Bitte versuchen Sie es erneut." : "Scan abgeschlossen."}
              </p>
            </div>

            <DialogFooter className="sm:justify-center">
              <DialogClose asChild>
                <Button 
                  type="button" 
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={closeModal}
                >
                  <XIcon size={18} className="mr-2"/>
                  Schliessen
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default JoinByInviteUI; 