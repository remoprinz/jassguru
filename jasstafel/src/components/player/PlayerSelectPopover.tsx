"use client";

import React, {useState} from "react";
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
import {Button} from "@/components/ui/button";
import {Check, ChevronsUpDown, UserPlus} from "lucide-react";
import {cn} from "@/lib/utils";
import type {FirestoreGroup} from "@/types/group";
import type {MemberInfo, PlayerInfo, PlayerNumber} from "@/types/jass";

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

  const availableMembers = React.useMemo(() => {
    if (!group?.players) return [];
    const selectedMemberIds = Object.values(currentSelection)
      .filter((p): p is MemberInfo => p?.type === "member")
      .map((p) => p.uid);
    return Object.entries(group.players)
      .map(([uid, playerData]): MemberInfo => ({
        type: "member",
        uid: uid,
        name: playerData.displayName || "Unbekannt",
      }))
      .filter((member) => !selectedMemberIds.includes(member.uid));
  }, [group, currentSelection]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-800 border-gray-700 text-white">
        <Command>
          <CommandInput placeholder="Mitglied suchen..." className="h-9 border-gray-700 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500" />
          <CommandList>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
