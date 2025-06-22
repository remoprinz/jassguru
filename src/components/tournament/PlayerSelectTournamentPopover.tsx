"use client";

import React, { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { GamePlayers, PlayerNumber } from "@/types/jass";
import { cn } from "@/lib/utils";
import { ParticipantWithProgress } from '@/store/tournamentStore';
import ProfileImage from '@/components/ui/ProfileImage';

interface PlayerSelectTournamentPopoverProps {
  trigger: React.ReactNode;
  participants: ParticipantWithProgress[];
  currentSelection: GamePlayers;
  targetSlot: PlayerNumber;
  onSelectParticipant: (slot: PlayerNumber, participant: ParticipantWithProgress) => void;
}

export const PlayerSelectTournamentPopover: React.FC<PlayerSelectTournamentPopoverProps> = ({
  trigger,
  participants,
  currentSelection,
  targetSlot,
  onSelectParticipant,
}) => {
  const [open, setOpen] = useState(false);
  const [filteredParticipants, setFilteredParticipants] = useState<ParticipantWithProgress[]>([]);

  useEffect(() => {
    if (participants) {
      setFilteredParticipants(participants);
    }
  }, [participants]);

  const handleSelectParticipant = (participant: ParticipantWithProgress) => {
    onSelectParticipant(targetSlot, participant);
    setOpen(false);
  };

  // Erstelle eine Map der bereits ausgewählten Spieler-UIDs für schnellen Zugriff
  const selectedPlayerUids = Object.values(currentSelection)
    .filter((player): player is NonNullable<typeof player> => !!player)
    .filter(player => player.type === 'member')
    .map(player => player.uid);

  // Filtere Teilnehmer, die bereits ausgewählt sind
  const availableParticipants = participants.filter(participant => 
    // Prüfe, ob participant.uid in selectedPlayerUids existiert
    !selectedPlayerUids.includes(participant.uid || '')
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        <div className="max-h-80 overflow-auto">
          <div className="p-4 space-y-2">
            <h4 className="text-sm font-medium leading-none">Teilnehmer auswählen</h4>
            <p className="text-sm text-gray-500">Wähle einen Spieler für Position {targetSlot}.</p>
            {availableParticipants.length === 0 && (
              <p className="text-sm text-gray-500">Keine weiteren Teilnehmer verfügbar.</p>
            )}
            <div className="space-y-2 mt-2">
              {availableParticipants.map((participant) => (
                <div 
                  key={participant.uid} 
                  onClick={() => handleSelectParticipant(participant)}
                  className={cn(
                    "flex items-center px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer",
                  )}
                >
                  <ProfileImage 
                    src={participant.photoURL || undefined}
                    alt={participant.displayName || ''}
                    size="sm"
                    className="mr-2 flex-shrink-0"
                    fallbackClassName="bg-gray-600 text-gray-300 text-xs"
                    fallbackText={participant.displayName?.substring(0, 2).toUpperCase() || '??'}
                  />
                  <div className="flex-grow">
                    <p className="text-sm">{participant.displayName || 'Unbekannt'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}; 