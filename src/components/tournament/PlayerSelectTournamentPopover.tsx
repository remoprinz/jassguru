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
import { isPlayerAvailableForPasse } from '@/utils/tournamentPasseUtils';

interface PlayerSelectTournamentPopoverProps {
  trigger: React.ReactNode;
  participants: ParticipantWithProgress[];
  currentSelection: GamePlayers;
  targetSlot: PlayerNumber;
  onSelectParticipant: (slot: PlayerNumber, participant: ParticipantWithProgress) => void;
  playersInActivePasses?: Set<string>; // 🆕 NEU: Spieler, die bereits in einer aktiven Passe sind
  passeNumber: number; // 🎯 NEU: Passe-Nummer für Verfügbarkeits-Check
}

export const PlayerSelectTournamentPopover: React.FC<PlayerSelectTournamentPopoverProps> = ({
  trigger,
  participants,
  currentSelection,
  targetSlot,
  onSelectParticipant,
  playersInActivePasses = new Set(),
  passeNumber,
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

  // 🎯 NEUE LOGIK: Filtere bereits ausgewählte Spieler raus, markiere nicht-verfügbare
  const participantsWithAvailability = participants
    .filter(participant => {
      // Bereits ausgewählte Spieler komplett ausblenden
      const uid = participant.uid || '';
      return !selectedPlayerUids.includes(uid);
    })
    .map(participant => {
    const uid = participant.uid || '';
      
      // Prüfe Verfügbarkeit mit shared Helper
      const available = isPlayerAvailableForPasse(
        participant,
        passeNumber,
        playersInActivePasses
      );
      
      if (!available) {
        const completedCount = participant.completedPassesCount || 0;
        if (completedCount >= passeNumber) {
          return {
            participant,
            available: false,
            reason: `Hat Passe ${passeNumber} bereits gespielt`
          };
        } else if (playersInActivePasses.has(uid)) {
          return {
            participant,
            available: false,
            reason: 'Spielt gerade eine Passe'
          };
    }
      }
      
      return {
        participant,
        available: true,
        reason: null
      };
    });
  
  // Sortiere: Verfügbare zuerst, dann nicht-verfügbare
  participantsWithAvailability.sort((a, b) => {
    if (a.available === b.available) return 0;
    return a.available ? -1 : 1;
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
            {participantsWithAvailability.filter(p => p.available).length === 0 && (
              <p className="text-sm text-gray-500">Keine Spieler für Passe {passeNumber} verfügbar.</p>
            )}
            <div className="space-y-2 mt-2">
              {participantsWithAvailability.map(({ participant, available, reason }) => {
                return (
                <div 
                  key={participant.uid} 
                  onClick={() => available && handleSelectParticipant(participant)}
                  className={cn(
                      "flex items-center px-2 py-2 rounded-md",
                    !available 
                      ? "opacity-40 cursor-not-allowed bg-gray-50" 
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
                    {!available && reason && (
                      <p className="text-xs text-gray-500">{reason}</p>
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