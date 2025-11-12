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
  playersInActivePasses?: Set<string>; // 🆕 NEU: Spieler, die bereits in einer aktiven Passe sind
}

export const PlayerSelectTournamentPopover: React.FC<PlayerSelectTournamentPopoverProps> = ({
  trigger,
  participants,
  currentSelection,
  targetSlot,
  onSelectParticipant,
  playersInActivePasses = new Set(),
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

  // Filtere Teilnehmer, die bereits ausgewählt sind ODER in einer aktiven Passe sind
  const availableParticipants = participants.filter(participant => {
    const uid = participant.uid || '';
    // Ausblenden, wenn bereits ausgewählt
    if (selectedPlayerUids.includes(uid)) {
      return false;
    }
    // 🆕 NEU: Ausblenden, wenn in einer aktiven Passe
    if (playersInActivePasses.has(uid)) {
      return false;
    }
    return true;
  });

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
              {availableParticipants.map((participant) => {
                const isInActivePasse = playersInActivePasses.has(participant.uid || '');
                return (
                <div 
                  key={participant.uid} 
                    onClick={() => !isInActivePasse && handleSelectParticipant(participant)}
                  className={cn(
                      "flex items-center px-2 py-2 rounded-md",
                      isInActivePasse 
                        ? "opacity-50 cursor-not-allowed bg-gray-50" 
                        : "hover:bg-gray-100 cursor-pointer"
                  )}
                >
                  <ProfileImage 
                    src={participant.photoURL || undefined}
                    alt={participant.displayName || ''}
                    size="md"
                    className="mr-3 flex-shrink-0"
                    fallbackClassName="bg-gray-600 text-gray-300 text-base"
                    fallbackText={participant.displayName?.substring(0, 2).toUpperCase() || '??'}
                    context="list"
                    lazy={false}
                  />
                  <div className="flex-grow">
                    <p className="text-sm">{participant.displayName || 'Unbekannt'}</p>
                      {isInActivePasse && (
                        <p className="text-xs text-gray-500">In aktiver Passe</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}; 