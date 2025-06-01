import React, {useState, useCallback} from "react";
import Cropper, {Area} from "react-easy-crop";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import {getCroppedImg} from "@/utils/cropImage"; // Hilfsfunktion für react-easy-crop

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void; // Wird aufgerufen bei Abbruch oder externem Schließen
  imageSrc: string | null;
  onCropComplete: (blob: Blob | null) => void; // Wird aufgerufen bei Klick auf "Hochladen" (mit Blob) oder bei Fehler (mit null)
  confirmButtonLabel?: string;
  confirmButtonClassName?: string; // NEU: Prop für Button-Styling
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  confirmButtonLabel = "Hochladen", // NEU: Standard-Label geändert
  confirmButtonClassName = "bg-green-600 hover:bg-green-700", // NEU: Standard-Klasse (grün)
}) => {
  const [crop, setCrop] = useState({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteInternal = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Diese Funktion wird NUR für Abbrechen-Button und onOpenChange(false) verwendet
  const handleClose = useCallback(() => {
    onClose(); // Nur den onClose Callback der Elternkomponente aufrufen
    // Reset internal state
    setZoom(1);
    setCrop({x: 0, y: 0});
    setCroppedAreaPixels(null);
  }, [onClose]);

  // Diese Funktion wird NUR für den Bestätigen-Button verwendet
  const showCroppedImage = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) {
      onCropComplete(null); // Signalisiere Fehler/Unmöglichkeit
      // onClose(); // Schließen wird jetzt von der Elternkomponente gehandhabt
      return;
    }
    try {
      const croppedImageBlob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        0 
      );
      onCropComplete(croppedImageBlob); // Übergibt das Ergebnis an die Elternkomponente
      // onClose(); // Schließen wird jetzt von der Elternkomponente gehandhabt
    } catch (e) {
      console.error("Error cropping image:", e);
      onCropComplete(null); // Signalisiert Fehler an die Elternkomponente
      // onClose(); // Schließen wird jetzt von der Elternkomponente gehandhabt
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete]);

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(prevZoom + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom - 0.1, 1));
  };

  // Stellt sicher, dass bei externem Schließen handleClose aufgerufen wird
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose(); 
    }
    // Für `open = true` müssen wir nichts tun, das wird durch die `isOpen` Prop gesteuert
  };

  if (!imageSrc) {
    return null; // Nicht rendern, wenn keine Bildquelle vorhanden ist
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/* Styling ggf. anpassen, falls das vorherige besser war */}
      <DialogContent className="w-[90%] max-w-[500px] mx-auto bg-gray-800 border-gray-700 text-white p-6 rounded-lg">
        <DialogHeader className="pt-0 px-0">
          <DialogTitle>Bild zuschneiden</DialogTitle>
        </DialogHeader>
        <div className="relative h-64 w-full bg-gray-900 mb-4">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1 / 1} // Quadratisch
            cropShape="round" // Runder Ausschnitt
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteInternal}
            minZoom={1}
            maxZoom={3}
          />
        </div>
        <div className="flex items-center justify-between space-x-4 pb-4">
          <Button
            onClick={handleZoomOut}
            variant="outline"
            size="icon"
            className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            aria-label="Verkleinern"
          >
            -
          </Button>
          <Slider
            min={1}
            max={3}
            step={0.1}
            value={[zoom]}
            onValueChange={(value: number[]) => setZoom(value[0])}
            className="flex-grow mx-4 [&>span:first-child]:h-2 [&>span:first-child>span]:bg-blue-500"
            aria-label="Zoom-Level"
          />
          <Button
            onClick={handleZoomIn}
            variant="outline"
            size="icon"
            className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            aria-label="Vergrößern"
          >
            +
          </Button>
        </div>

        {/* NEUER Instruktionstext */}
        <p className="text-sm text-gray-400 text-center mb-4">
          Wähle den Bildausschnitt durch Zoomen und Verschieben. Klicke dann auf '{confirmButtonLabel}'.
        </p>

        <DialogFooter className="flex-col space-y-2 sm:flex-col sm:space-x-0 sm:space-y-2">
          <Button
            onClick={showCroppedImage} // Ruft nur noch onCropComplete auf
            className={`w-full ${confirmButtonClassName} text-white`} 
          >
            {confirmButtonLabel}
          </Button>
          <Button
            className="w-full bg-gray-600 text-white hover:bg-gray-500 border border-gray-500"
            onClick={handleClose} // Ruft nur noch onClose auf
          >
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropModal;
