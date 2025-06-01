"use client";

import React, {useState, useEffect} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Checkbox} from "@/components/ui/checkbox";
import type {PlayerNumber, GuestInfo} from "@/types/jass";

interface AddGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSlot: PlayerNumber | null;
  onAddGuest: (slot: PlayerNumber, guestInfo: GuestInfo) => void;
}

export const AddGuestModal: React.FC<AddGuestModalProps> = ({
  isOpen,
  onClose,
  targetSlot,
  onAddGuest,
}) => {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGuestName("");
      setGuestEmail("");
      setConsent(false);
      setError(null);
    }
  }, [isOpen]);

  const handleAdd = () => {
    if (!guestName.trim()) {
      setError("Bitte gib einen Namen für den Gast ein.");
      return;
    }
    if (guestEmail.trim() && !consent) {
      setError("Bitte bestätige die Einwilligung zur E-Mail-Speicherung.");
      return;
    }
    if (targetSlot === null) {
      console.error("Target slot is null, cannot add guest.");
      setError("Interner Fehler: Ziel-Slot nicht gesetzt.");
      return;
    }

    setError(null);
    onAddGuest(targetSlot, {
      type: "guest",
      name: guestName.trim(),
      email: guestEmail.trim() || null,
      consent: consent && !!guestEmail.trim(),
    });
    onClose();
  };

  const handleConsentChange = (checked: boolean | "indeterminate") => {
    if (typeof checked === "boolean") {
      setConsent(checked);
      if (!checked) {
        setError(null);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>Gast hinzufügen (Slot {targetSlot})</DialogTitle>
          <DialogDescription className="text-gray-400">
            Gib die Daten für den Gastspieler ein.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="guestName">Name *</Label>
            <Input
              id="guestName"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Name des Gastes"
              className="bg-gray-700 border-gray-600 text-white"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guestEmail">E-Mail (Optional)</Label>
            <Input
              id="guestEmail"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="fuer spaetere Einladung"
              className="bg-gray-700 border-gray-600 text-white"
            />
          </div>
          {guestEmail.trim() && (
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={handleConsentChange}
                className="border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
              <Label
                htmlFor="consent"
                className="text-xs leading-snug text-gray-400 cursor-pointer"
              >
                   Ich bin damit einverstanden, dass die E-Mail zum Zweck einer späteren Gruppeneinladung durch einen Admin gespeichert wird.
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
          >
             Abbrechen
          </Button>
          <Button
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-700"
          >
             Gast hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
