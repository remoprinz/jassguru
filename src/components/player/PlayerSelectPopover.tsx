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
import {getGroupMembers} from "@/services/groupService";
import ProfileImage from '@/components/ui/ProfileImage';

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

  // OPTIMIERT: Lade alle Members mit einem einzigen Firestore-Read
  useEffect(() => {
    const fetchPlayerDocs = async () => {
      if (!group?.id) return;
      
      setIsLoading(true);
      console.log("### PlayerSelectPopover: [OPTIMIERT] Lade Members für Gruppe", group.id);
      
      try {
        // 🚀 PERFORMANCE-BOOST: 1 Read statt 12+ Reads
        const members = await getGroupMembers(group.id);
        
        if (members.length > 0) {
          // Konvertiere Members zu PlayerDocs Format für Kompatibilität
          const playerData: {[playerId: string]: FirestorePlayer} = {};
          
          members.forEach(member => {
            playerData[member.playerId] = {
              id: member.playerId,
              displayName: member.displayName,
              photoURL: member.photoURL,
              // Füge minimale Required-Felder hinzu
              userId: null, // Wird nicht für UI benötigt
              isGuest: false, // Default-Wert
              createdAt: member.joinedAt,
              updatedAt: member.joinedAt,
              groupIds: [group.id!]
            } as FirestorePlayer;
          });
          
          setPlayerDocs(playerData);
          console.log(`### PlayerSelectPopover: [OPTIMIERT] ${members.length} Members in 1 Read geladen!`);
        } else {
          console.log("### PlayerSelectPopover: [FALLBACK] Keine Members in Subcollection, nutze alte Methode");
          // Fallback zur alten Methode falls members-Subcollection leer ist
          await fallbackToOldMethod();
        }
      } catch (error) {
        console.error("### PlayerSelectPopover: [FALLBACK] Fehler beim optimierten Laden, nutze alte Methode:", error);
        await fallbackToOldMethod();
      }
      
      setIsLoading(false);
    };

    const fallbackToOldMethod = async () => {
      if (!group?.playerIds?.length) return;
      
      console.log("### PlayerSelectPopover: [FALLBACK] Lade", group.playerIds.length, "Spieler einzeln...");
      const playerData: {[playerId: string]: FirestorePlayer} = {};
      
      for (const playerId of group.playerIds) {
        try {
          const playerDoc = await getPlayerDocument(playerId);
          if (playerDoc) {
            playerData[playerId] = playerDoc;
          }
        } catch (err) {
          console.error(`### PlayerSelectPopover: [FALLBACK] Fehler beim Laden des Spielers ${playerId}:`, err);
        }
      }
      
      setPlayerDocs(playerData);
    };
    
    fetchPlayerDocs();
  }, [group?.id, group?.playerIds]);

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
            playerId: playerId, // ✅ HINZUGEFÜGT: Player Document ID
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
            playerId: uid, // ✅ FALLBACK: Verwende UID als playerId
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
                  {availableMembers.map((member) => {
                    // Finde das entsprechende FirestorePlayer-Objekt für das Profilbild
                    const playerDoc = Object.values(playerDocs).find(p => p.userId === member.uid || p.id === member.uid);
                    
                    return (
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
                        <div className="flex items-center">
                          <ProfileImage 
                            src={playerDoc?.photoURL}
                            alt={member.name} 
                            size="sm"
                            className="mr-2 flex-shrink-0"
                            fallbackClassName="bg-gray-600 text-gray-300 text-xs"
                            fallbackText={member.name.charAt(0).toUpperCase()}
                          />
                          <span>{member.name}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
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
