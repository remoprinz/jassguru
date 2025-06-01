"use client";

import React, {useState, useEffect} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { UserPlus} from "lucide-react";
import type {FirestoreGroup, FirestorePlayer, MemberInfo, PlayerInfo, PlayerNumber} from "@/types/jass";
// Importiere die Funktion, um einen Player per ID zu laden
import {getPlayerDocument} from "@/services/playerService";

interface PlayerSelectPopoverProps {
  trigger: React.ReactNode;
  group: FirestoreGroup | null;
  currentSelection: Record<PlayerNumber, PlayerInfo>;
  targetSlot: PlayerNumber;
  onSelectMember: (slot: PlayerNumber, member: MemberInfo) => void;
  onAddGuest: (slot: PlayerNumber) => void;
}

// Komponente mit korrekten Export
export const PlayerSelectPopover: React.FC<PlayerSelectPopoverProps> = ({
  trigger,
  group,
  currentSelection,
  targetSlot,
  onSelectMember,
  onAddGuest,
}) => {
  const [open, setOpen] = useState(false);
  const [playerDocs, setPlayerDocs] = useState<{[playerId: string]: FirestorePlayer}>({});
  const [isLoading, setIsLoading] = useState(false);

  // Effekt, um alle playerIds der Gruppe zu laden
  useEffect(() => {
    const fetchPlayerDocs = async () => {
      if (!group?.playerIds?.length) return;
      
      setIsLoading(true);
      // console.log("### PlayerSelectPopover: Lade Spielerdaten für", group.playerIds.length, "Spieler...");
      
      const playerData: {[playerId: string]: FirestorePlayer} = {};
      
      for (const playerId of group.playerIds) {
        try {
          const playerDoc = await getPlayerDocument(playerId);
          if (playerDoc) {
            playerData[playerId] = playerDoc;
            // console.log(`### PlayerSelectPopover: Spielerdaten für ${playerId} geladen:`, 
            //             playerDoc.nickname || playerDoc.displayName || "Kein Name");
          }
        } catch (err) {
          console.error(`### PlayerSelectPopover: Fehler beim Laden des Spielers ${playerId}:`, err);
        }
      }
      
      setPlayerDocs(playerData);
      setIsLoading(false);
      // console.log("### PlayerSelectPopover: Alle Spielerdaten geladen:", Object.keys(playerData).length);
    };
    
    fetchPlayerDocs();
  }, [group?.playerIds]);

  // Verwende jetzt die geladenen Player-Dokumente anstelle der eingebetteten Daten
  const availableMembers = React.useMemo(() => {
    if (!group?.players) {
      // console.log("### PlayerSelectPopover: Keine Gruppe oder keine Spieler in der Gruppe");
      return [];
    }
    
    const selectedMemberIds = Object.values(currentSelection)
      .filter((p): p is MemberInfo => p?.type === "member")
      .map((p) => p.uid);
    
    // console.log("### PlayerSelectPopover: Bereits ausgewählte Spieler-IDs:", selectedMemberIds);
    
    // Änderung hier: Verwende die geladenen playerDocs anstelle von group.players
    const members: MemberInfo[] = [];

    // Zuerst versuchen wir es mit den korrekt geladenen Player-Dokumenten
    if (Object.keys(playerDocs).length > 0) {
      // console.log("### PlayerSelectPopover: Verwende geladene Player-Dokumente für die Anzeige");
      
      for (const [playerId, playerData] of Object.entries(playerDocs)) {
        // Verwende die userId als uid für die Mitgliedinfo
        const uid = playerData.userId || playerId;
        if (!selectedMemberIds.includes(uid)) {
          members.push({
            type: "member",
            uid: uid,
            // Verwende nickname oder displayName aus dem Player-Dokument
            name: playerData.displayName || "Unbekannt",
          });
        }
      }
    } 
    // Fallback zur alten Methode, falls keine Player-Dokumente geladen wurden
    else {
      // console.log("### PlayerSelectPopover: Fallback - Verwende eingebettete Spielerdaten");
      
      for (const [uid, playerData] of Object.entries(group.players)) {
        if (!selectedMemberIds.includes(uid)) {
          members.push({
            type: "member",
            uid: uid,
            name: playerData.displayName || "Unbekannt",
          });
        }
      }
    }
    
    // console.log("### PlayerSelectPopover: Verfügbare Mitglieder:", members);
    return members;
  }, [group, currentSelection, playerDocs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-800 border-gray-700 text-white">
        <Command>
          <CommandInput placeholder="Mitglied suchen..." className="h-9 border-gray-700 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500" />
          <CommandList>
            {isLoading ? (
              <div className="py-3 text-center text-gray-400 text-sm">
                Lade Mitglieder...
              </div>
            ) : (
              <>
                <CommandEmpty>Keine Mitglieder gefunden.</CommandEmpty>
                <CommandGroup heading="Mitglieder auswählen">
                  {availableMembers.map((member) => (
                    <CommandItem
                      key={member.uid}
                      value={member.name}
                      onSelect={(currentValue: string) => {
                        const selected = availableMembers.find((m) => m.name.toLowerCase() === currentValue.toLowerCase());
                        if (selected) {
                          onSelectMember(targetSlot, selected);
                        }
                        setOpen(false);
                      }}
                      className="hover:bg-gray-700 aria-selected:bg-blue-900/50"
                    >
                      {member.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {/* Gast-Option */}
                <CommandSeparator className="bg-gray-700 my-1" />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      onAddGuest(targetSlot);
                      setOpen(false); // Popover schließen nach Auswahl
                    }}
                    className="hover:bg-gray-700 cursor-pointer"
                  >
                    <UserPlus className="mr-2 h-4 w-4 text-gray-400" />
                         Als Gast hinzufügen...
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
