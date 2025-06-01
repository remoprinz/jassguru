"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
// import { ScrollArea } from '@/components/ui/scroll-area'; // VORERST AUSKOMMENTIERT
import { Loader2, UserPlus, AlertTriangle } from 'lucide-react';
import { useTournamentStore } from '@/store/tournamentStore';
import { useGroupStore } from '@/store/groupStore'; // Annahme: groupStore zum Laden von Gruppenmitgliedern
import { useUIStore } from '@/store/uiStore';
import type { FirestorePlayer } from '@/types/jass';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Timestamp } from 'firebase/firestore'; // NEU: Timestamp importieren
import { fetchGroupMembers } from '@/services/groupService'; // NEU: Import aktiviert

interface AddParticipantsFromGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId?: string;
  groupId?: string;
}

const AddParticipantsFromGroupModal: React.FC<AddParticipantsFromGroupModalProps> = ({ 
  isOpen, 
  onClose, 
  tournamentId, 
  groupId 
}) => {
  const showNotification = useUIStore((state) => state.showNotification);
  const currentTournamentInstance = useTournamentStore((state) => state.currentTournamentInstance);
  // Annahme: groupStore hat eine Funktion/State, um Mitglieder zu laden/zu halten
  // const groupMembers = useGroupStore((state) => state.currentGroupMembers); 
  // const fetchGroupMembersForModal = useGroupStore((state) => state.fetchGroupMembers); 

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allGroupMembers, setAllGroupMembers] = useState<FirestorePlayer[]>([]); // Geändert von groupMembers
  const [selectedPlayerUids, setSelectedPlayerUids] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // NEU: Logik für maxParticipants
  const maxParticipants = currentTournamentInstance?.settings?.maxParticipants;
  const currentParticipantCount = currentTournamentInstance?.participantUids?.length || 0;
  const canAddMore = !maxParticipants || maxParticipants <= 0 || (currentParticipantCount < maxParticipants);
  const remainingSlots = (maxParticipants && maxParticipants > 0) ? Math.max(0, maxParticipants - currentParticipantCount) : Infinity;

  useEffect(() => {
    const loadData = async () => {
      if (!isOpen || !groupId || !tournamentId) {
        setAllGroupMembers([]);
        setSelectedPlayerUids([]);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        // Implementiere tatsächliches Laden von Gruppenmitgliedern
        const members = await fetchGroupMembers(groupId); // Service-Aufruf aktiviert
        setAllGroupMembers(members || []); 
        // console.warn("[AddParticipantsFromGroupModal] Laden von Gruppenmitgliedern ist nur simuliert, da fetchGroupMembers nicht verfügbar ist.");
        // const now = Timestamp.now(); 
        // const simulatedMembers: FirestorePlayer[] = [
        //   { id: 'user1', userId: 'user1', displayName: 'Remo Simuliert', photoURL: null, isGuest: false, groupIds: [groupId || 'group1'], createdAt: now },
        //   { id: 'user2', userId: 'user2', displayName: 'Simona Simuliert', photoURL: null, isGuest: false, groupIds: [groupId || 'group1'], createdAt: now },
        //   { id: 'user3', userId: 'user3', displayName: 'ChatGPT Simuliert', photoURL: null, isGuest: true, groupIds: [], createdAt: now }, 
        //   { id: 'user4', userId: 'user4', displayName: 'Claude Simuliert', photoURL: null, isGuest: false, groupIds: [groupId || 'group1', 'group2'], createdAt: now },
        //   ...(currentTournamentInstance?.participantUids.map(uid => ({
        //     id: uid, 
        //     userId: uid, 
        //     displayName: `Teilnehmer ${uid.substring(0,4)}`, 
        //     photoURL: null, 
        //     isGuest: false, 
        //     groupIds: [groupId || 'group1'], 
        //     createdAt: now 
        //   })) || []) 
        // ];
        // setAllGroupMembers(simulatedMembers); 

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gruppenmitglieder konnten nicht geladen werden.";
        setError(msg);
        showNotification({ message: msg, type: "error" });
      }
      setIsLoading(false);
    };

    loadData();
  }, [isOpen, groupId, tournamentId, showNotification]);

  const handleTogglePlayer = (uid: string) => {
    setSelectedPlayerUids(prev => {
      const isCurrentlySelected = prev.includes(uid);
      if (isCurrentlySelected) {
        return prev.filter(id => id !== uid);
      } else {
        // NEU: Prüfen, ob das Hinzufügen das Limit überschreiten würde
        if (selectedPlayerUids.length < remainingSlots) {
          return [...prev, uid];
        }
        showNotification({ message: `Maximale Teilnehmerzahl (${maxParticipants}) würde überschritten.`, type: "warning" });
        return prev; // Auswahl nicht ändern
      }
    });
  };

  const handleSubmit = async () => {
    if (!tournamentId || selectedPlayerUids.length === 0) {
      showNotification({ message: "Keine Spieler ausgewählt oder Turnier-ID fehlt.", type: "warning" });
      return;
    }
    setIsSubmitting(true);
    try {
      // NEU: Finale Prüfung vor dem Absenden (sollte durch UI-Logik eigentlich schon abgedeckt sein)
      if (selectedPlayerUids.length > remainingSlots) {
        showNotification({ message: `Auswahl überschreitet die maximal erlaubte Teilnehmerzahl von ${maxParticipants}.`, type: "error" });
        setIsSubmitting(false);
        return;
      }

      // Verwende die neue Store-Action
      const success = await useTournamentStore.getState().addMultipleParticipants(tournamentId, selectedPlayerUids);
      // console.log("[AddParticipantsFromGroupModal] Simuliere Hinzufügen von:", selectedPlayerUids, "zu Turnier:", tournamentId);
      // await new Promise(resolve => setTimeout(resolve, 1000)); // Simuliere Netzwerk-Delay
      // const success = true; // Annahme für Simulation - entfernt

      if (success) {
        showNotification({ message: `${selectedPlayerUids.length} Spieler zum Turnier hinzugefügt.`, type: "success" });
        setSelectedPlayerUids([]);
        // Optional: Modal direkt schließen oder auf Bestätigung des Benutzers warten
        onClose(); 
        // Trigger Neuladen der Teilnehmerliste in der Settings-Seite (useEffect dort sollte das machen)
        useTournamentStore.getState().fetchTournamentInstanceDetails(tournamentId); 
      } else {
        throw new Error("Spieler konnten nicht hinzugefügt werden.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler beim Hinzufügen der Spieler.";
      showNotification({ message: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const availablePlayersToAdd = useMemo(() => {
    if (!currentTournamentInstance) return allGroupMembers; // Geändert von groupMembers
    const tournamentParticipantUids = currentTournamentInstance.participantUids || [];
    return allGroupMembers.filter(gm => {
        if (!gm.userId) return false; // Sicherheitshalber prüfen
        return !tournamentParticipantUids.includes(gm.userId);
    });
  }, [allGroupMembers, currentTournamentInstance]); // Geändert von groupMembers


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-gray-800 border-gray-700 text-white rounded-xl">
        <DialogHeader className="pt-4">
          <DialogTitle className="text-xl text-white flex items-center justify-center">
            <UserPlus className="mr-2 h-5 w-5 text-blue-400" /> Mitglieder aus Gruppe hinzufügen
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center pt-2">
            Wähle Gruppenmitglieder aus, die du zum Turnier "{currentTournamentInstance?.name || 'Turnier'}" hinzufügen möchtest.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-48">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400 mb-3" />
            <p className="text-gray-300">Lade Gruppenmitglieder...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="my-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-center">
            <AlertTriangle className="inline-block h-5 w-5 mr-2" />{error}
          </div>
        )}

        {!isLoading && !error && availablePlayersToAdd.length === 0 && (
          <div className="my-4 p-3 text-center text-gray-400">
            <p>Alle Gruppenmitglieder nehmen bereits am Turnier teil oder es konnten keine Mitglieder geladen werden.</p>
          </div>
        )}

        {!isLoading && !error && availablePlayersToAdd.length > 0 && (
          <div className="max-h-[calc(100vh-300px)] my-4 pr-3 overflow-y-auto">
            {maxParticipants && maxParticipants > 0 && (
              <p className="text-sm text-yellow-400 mb-2 px-1">
                Max. Teilnehmer: {currentParticipantCount} / {maxParticipants}. Du kannst noch {remainingSlots} Spieler auswählen.
                {remainingSlots === 0 && selectedPlayerUids.length === 0 && " Limit erreicht."}
              </p>
            )}
            <div className="space-y-2">
              {availablePlayersToAdd.map((player) => {
                const isDisabled = selectedPlayerUids.length >= remainingSlots && !selectedPlayerUids.includes(player.userId || ' ');
                return (
                  <div key={player.id} 
                       className={`flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-700/50 cursor-pointer ${isDisabled ? 'opacity-50' : ''}`}
                       onClick={() => !isDisabled && player.userId && handleTogglePlayer(player.userId)}>
                    <Checkbox
                      id={`player-${player.id}`}
                      checked={player.userId ? selectedPlayerUids.includes(player.userId) : false}
                      onCheckedChange={() => player.userId && handleTogglePlayer(player.userId)}
                      disabled={isDisabled}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label htmlFor={`player-${player.id}`} className="flex items-center space-x-3 flex-1 cursor-pointer">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={player.photoURL || undefined} alt={player.displayName || 'Avatar'} />
                        <AvatarFallback className="bg-gray-600 text-gray-300">
                          {player.displayName?.charAt(0).toUpperCase() || "P"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-gray-200">{player.displayName || "Unbekannter Spieler"}</span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button
            onClick={handleSubmit}
            disabled={selectedPlayerUids.length === 0 || isSubmitting}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white order-2 sm:order-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Füge hinzu...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {selectedPlayerUids.length} Spieler hinzufügen
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onClose}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white order-1 sm:order-2"
          >
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddParticipantsFromGroupModal; 