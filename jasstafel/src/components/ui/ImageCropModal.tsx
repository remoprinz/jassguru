import React, {useState, useCallback} from "react";
import Cropper, {Area} from "react-easy-crop";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import {getCroppedImg} from "@/utils/cropImage"; // Hilfsfunktion, die wir noch erstellen müssen

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  onCropComplete: (blob: Blob | null) => void;
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({isOpen, onClose, imageSrc, onCropComplete}) => {
  const [crop, setCrop] = useState({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteInternal = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleClose = () => {
    onCropComplete(null); // Signalisiert Abbruch
    onClose();
    // Reset state if needed when closing
    setZoom(1);
    setCrop({x: 0, y: 0});
  };

  const showCroppedImage = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) {
      return;
    }
    try {
      const croppedImageBlob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        0 // rotation = 0, da wir keine Drehung implementieren
      );
      onCropComplete(croppedImageBlob);
      onClose();
      // Reset state after successful crop
      setZoom(1);
      setCrop({x: 0, y: 0});
    } catch (e) {
      console.error("Error cropping image:", e);
      onCropComplete(null); // Signalisiert Fehler
      onClose();
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete, onClose]);

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(prevZoom + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom - 0.1, 1));
  };

  if (!imageSrc) {
    return null; // Nicht rendern, wenn keine Bildquelle vorhanden ist
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[90%] mx-auto bg-gray-800 border-gray-700 text-white p-6 rounded-lg">
        <DialogHeader className="pt-0 px-0">
          <DialogTitle>Bild zuschneiden</DialogTitle>
        </DialogHeader>
        <div className="relative h-64 w-full bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1 / 1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteInternal}
            minZoom={1}
            maxZoom={3}
          />
        </div>
        <div className="flex items-center justify-between space-x-4 py-4">
          <Button
            onClick={handleZoomOut}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600"
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
            className="flex-grow mx-4"
            aria-label="Zoom-Level"
          />
          <Button
            onClick={handleZoomIn}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600"
            aria-label="Vergrößern"
          >
            +
          </Button>
        </div>
        <DialogFooter className="flex-col space-y-2 sm:flex-col sm:space-x-0 sm:space-y-2">
          <Button
            onClick={showCroppedImage}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Zuschneiden
          </Button>
          <Button
            onClick={handleClose}
            className="w-full bg-gray-600 text-white hover:bg-gray-500 border border-gray-500"
          >
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropModal;
