"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft, Users, Globe, Settings, Crown, Loader2, ShieldCheck, AlertTriangle, Wrench, X} from "lucide-react";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {useUIStore} from "@/store/uiStore";
import MainLayout from "@/components/layout/MainLayout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Switch} from "@/components/ui/switch";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {getFunctions, httpsCallable} from "firebase/functions";
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from "@/components/ui/alert-dialog";
import {getPlayerDocument, ensurePlayersExist} from "@/services/playerService";
import {FirestorePlayer} from "@/types/jass";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {db} from "@/services/firebaseInit";
import {doc, getDoc, updateDoc, arrayRemove, arrayUnion, Timestamp} from "firebase/firestore";

// Typ für FirestorePlayer mit _isPlaceholder Eigenschaft
type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

const GroupSettingsPage: React.FC = () => {
  const {user, status, isAuthenticated} = useAuthStore();
  const {currentGroup, updateGroup, updateMemberRole} = useGroupStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const router = useRouter();

  // Form state
  const [name, setName] = useState(currentGroup?.name || "");
  const [description, setDescription] = useState(currentGroup?.description || "");
  const [isPublic, setIsPublic] = useState(currentGroup?.isPublic ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidating, setIsInvalidating] = useState(false);

  // Member list state
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [roleChangeLoading, setRoleChangeLoading] = useState<Record<string, boolean>>({});
  const [repairingData, setRepairingData] = useState(false);
  const [hasInconsistentData, setHasInconsistentData] = useState(false);

  // Check if current user is admin (using userId/uid, not playerId)
  const isCurrentUserAdmin = !!user?.uid && !!currentGroup?.adminIds.includes(user.uid);

  // Redirect wenn nicht eingeloggt oder keine aktive Gruppe oder kein Admin
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated()) {
        router.push("/");
      } else if (!currentGroup) {
        router.push("/start");
      } else if (!isCurrentUserAdmin) {
        showNotification({ message: "Nur Admins können die Gruppeneinstellungen bearbeiten.", type: "error" });
        router.push("/start");
      }
    }
  }, [status, isAuthenticated, router, currentGroup, isCurrentUserAdmin, showNotification]);

  // Fetch member details
  useEffect(() => {
    const fetchMembers = async () => {
      if (!currentGroup || !currentGroup.playerIds || currentGroup.playerIds.length === 0) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }
      setMembersLoading(true);
      
      // Variable zum Tracking, ob Daten korrigiert wurden
      let dataWasHealed = false;
      
      try {
        console.log(`[DEBUG] Lade Mitglieder für Gruppe ${currentGroup.id}. playerIds:`, currentGroup.playerIds);
        
        // Füge eine Validierung hinzu, um sicherzustellen, dass wir nur mit gültigen IDs arbeiten
        const validPlayerIds = currentGroup.playerIds.filter(id => typeof id === 'string' && id.trim() !== '');
        console.log(`[DEBUG] Nach Validierung: Verarbeite ${validPlayerIds.length} gültige Player-IDs`);
        
        // Erweiterte Logik: Prüfe und korrigiere playerIds, die eigentlich userIds sind
        const memberPromises = validPlayerIds.map(async idToCheck => {
          console.log(`[DEBUG] Lade Spieler ${idToCheck}`);
          try {
            // Erst versuchen, als playerId zu laden (Standardweg)
            const playerDoc = await getPlayerDocument(idToCheck);
            if (playerDoc) {
              console.log(`[DEBUG] Spieler ${idToCheck} gefunden:`, playerDoc.nickname);
              return playerDoc;
            } 
            
            console.warn(`[DEBUG] Kein Spielerdokument für ID ${idToCheck} gefunden! Prüfe ob es eine userId ist...`);
            
            // Wenn nicht gefunden, prüfe ob es eine userId ist
            const userRef = doc(db, "users", idToCheck);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists() && userSnap.data()?.playerId) {
              // Es ist eine userId! Korrigiere auf die playerId
              const correctPlayerId = userSnap.data()?.playerId;
              console.log(`[DEBUG] ID-Korrektur! ${idToCheck} ist eine userId. Korrekte playerId ist: ${correctPlayerId}`);
              
              // Versuche, mit korrekter ID den Player zu laden
              const correctedPlayerDoc = await getPlayerDocument(correctPlayerId);
              
              if (correctedPlayerDoc) {
                console.log(`[DEBUG] Spieler mit korrekter ID ${correctPlayerId} erfolgreich geladen: ${correctedPlayerDoc.nickname}`);
                
                // Selbstheilung der Gruppen-Daten
                try {
                  const groupRef = doc(db, "groups", currentGroup.id);
                  await updateDoc(groupRef, {
                    playerIds: arrayRemove(idToCheck)
                  });
                  await updateDoc(groupRef, {
                    playerIds: arrayUnion(correctPlayerId)
                  });
                  dataWasHealed = true;
                  console.log(`[DEBUG] ✅ Gruppen-Daten automatisch geheilt: ${idToCheck} -> ${correctPlayerId}`);
                } catch (updateError) {
                  console.error(`[DEBUG] ❌ Fehler bei Datenkorrektur für Gruppe ${currentGroup.id}:`, updateError);
                }
                
                return correctedPlayerDoc;
              }
            }
            
            // Wenn alles fehlschlägt, erstelle einen Platzhalter
            console.warn(`[DEBUG] Konnte keine Zuordnung für ID ${idToCheck} finden. Erstelle Platzhalter.`);
            return {
              id: idToCheck,
              nickname: `Unbekannter Spieler ${idToCheck.slice(0, 4)}...`,
              userId: null, // Da wir keine Zuordnung haben
              isGuest: false,
              createdAt: new Date() as unknown as Timestamp,
              updatedAt: new Date() as unknown as Timestamp,
              groupIds: [currentGroup.id],
              stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
              _isPlaceholder: true // Markierung für UI-Behandlung
            } as FirestorePlayer;
          } catch (error) {
            console.error(`[DEBUG] Fehler beim Laden/Korrigieren von ID ${idToCheck}:`, error);
            return null;
          }
        });
        
        const memberResults = await Promise.all(memberPromises);
        const validMembers = memberResults.filter(member => member !== null) as FirestorePlayer[];
        
        console.log(`[DEBUG] ${validMembers.length}/${currentGroup.playerIds.length} Mitglieder geladen:`, 
          validMembers.map(m => ({ 
            id: m.id, 
            nickname: m.nickname, 
            placeholder: (m as PlayerWithPlaceholder)._isPlaceholder 
          })));
        
        // Prüfe, ob Daten-Inkonsistenzen bestehen
        setHasInconsistentData(validMembers.some(m => (m as PlayerWithPlaceholder)._isPlaceholder));
        
        // Zeige Erfolgsbenachrichtigung bei Selbstheilung
        if (dataWasHealed) {
          showNotification({
            message: "Gruppen-Daten wurden automatisch korrigiert.",
            type: "success"
          });
        }
        
        setMembers(validMembers);
      } catch (err) {
        console.error("Fehler beim Laden der Mitgliederdetails:", err);
        setError("Mitgliederdetails konnten nicht geladen werden.");
      } finally {
        setMembersLoading(false);
      }
    };

    fetchMembers();
  }, [currentGroup, showNotification]);

  // Form-Daten aktualisieren wenn Gruppen-Daten geladen werden
  useEffect(() => {
    if (currentGroup) {
      setName(currentGroup.name || "");
      setDescription(currentGroup.description || "");
      setIsPublic(currentGroup.isPublic ?? true);
    }
  }, [currentGroup]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!currentGroup) throw new Error("Keine aktive Gruppe ausgewählt");

      await updateGroup(currentGroup.id, {
        name,
        description,
        isPublic,
      });

      showNotification({
        message: "Gruppe erfolgreich aktualisiert.",
        type: "success",
      });

      router.push("/start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
      setIsSubmitting(false);
    }
  };

  // Handle role change
  const handleRoleChange = async (targetPlayerId: string, newRole: 'admin' | 'member') => {
    setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: true }));
    try {
      await updateMemberRole(targetPlayerId, newRole);
      showNotification({
        message: `Rolle erfolgreich auf ${newRole === 'admin' ? 'Admin' : 'Mitglied'} geändert.`,
        type: "success",
      });
    } catch (err) {
      console.error("Fehler beim Ändern der Rolle:", err);
      showNotification({
        message: err instanceof Error ? err.message : "Rollenänderung fehlgeschlagen.",
        type: "error",
      });
    } finally {
      setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: false }));
    }
  };

  // CTA Button Setup
  useEffect(() => {
    setPageCta({
      isVisible: true,
      text: "Speichern",
      onClick: () => {
        const form = document.getElementById("group-form") as HTMLFormElement;
        form?.requestSubmit();
      },
      loading: isSubmitting,
      disabled: isSubmitting,
      variant: "info",
    });

    return () => {
      resetPageCta();
    };
  }, [setPageCta, resetPageCta, isSubmitting]);

  // Funktion zum Aufruf der invalidateActiveGroupInvites Function
  const handleInvalidateInvites = async () => {
    if (!currentGroup) {
      console.error("handleInvalidateInvites: No current group found.");
      return;
    }

    console.log("handleInvalidateInvites: Starting invalidation process...");
    setIsInvalidating(true);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const invalidateFn = httpsCallable(functions, "invalidateActiveGroupInvites");
      console.log(`handleInvalidateInvites: Calling cloud function for groupId: ${currentGroup.id} in region europe-west1`);
      const result = await invalidateFn({groupId: currentGroup.id});
      console.log("handleInvalidateInvites: Cloud function result received:", result.data);

      const data = result.data as { success: boolean; invalidatedCount?: number; message?: string }; // Message optional gemacht

      if (data.success) {
        const count = data.invalidatedCount ?? 0; // Default auf 0, falls nicht vorhanden
        showNotification({
          message: count > 0 ? `${count} Einladungslink(s) erfolgreich zurückgesetzt.` : "Keine aktiven Links gefunden.",
          type: "success",
        });
      } else {
        // Expliziter Fehlerfall von der Funktion
        throw new Error(data.message || "Fehler beim Zurücksetzen der Links vom Server.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Zurücksetzen der Links.";
      console.error("Error calling invalidateActiveGroupInvites:", error);
      showNotification({
        message: message,
        type: "error",
      });
    } finally {
      console.log("handleInvalidateInvites: Setting isInvalidating back to false.");
      setIsInvalidating(false);
    }
  };

  // Funktion zum Reparieren inkonsistenter Daten
  const handleRepairData = async () => {
    if (!currentGroup) return;
    
    try {
      setRepairingData(true);
      showNotification({
        message: "Datenkonsistenz wird überprüft...",
        type: "info"
      });
      
      // Nutze die neue Funktion, um Konsistenz sicherzustellen
      const repairedPlayers = await ensurePlayersExist(currentGroup.playerIds, currentGroup.id);
      
      console.log(`Datenreparatur abgeschlossen. ${repairedPlayers.length} Spieler repariert/geprüft.`);
      
      // Aktualisiere die Mitgliederliste
      setMembers(repairedPlayers);
      setHasInconsistentData(false);
      
      showNotification({
        message: `Datenreparatur erfolgreich. ${repairedPlayers.length} Spieler-Datensätze überprüft.`,
        type: "success"
      });
    } catch (error) {
      console.error("Fehler bei der Datenreparatur:", error);
      showNotification({
        message: "Fehler bei der Datenreparatur.",
        type: "error"
      });
    } finally {
      setRepairingData(false);
    }
  };

  // Zeige Ladescreen während Auth-Status geprüft wird
  if (status === "loading") {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Back Button */}
        <Link href="/start" passHref legacyBehavior>
          <Button
            variant="ghost"
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zur Startseite"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-6 py-16">
          <h1 className="text-center text-2xl font-bold text-white">
            Gruppeneinstellungen
          </h1>

          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" id="group-form">
            {/* Gruppengrundinformationen */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Grundinformationen
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Basis-Einstellungen für deine Gruppe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-gray-200">
                    Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white"
                    placeholder="Gruppenname"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-gray-200">
                    Beschreibung
                  </label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white min-h-[100px]"
                    placeholder="Gruppenbeschreibung (optional)"
                    maxLength={150}
                  />
                  <p className="text-xs text-gray-400">
                    Die Beschreibung wird auf der Startseite angezeigt. Maximal 150 Zeichen.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Sichtbarkeit */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Sichtbarkeit
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Wer kann die Gruppe sehen und beitreten?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-gray-200">
                      Öffentliche Gruppe
                    </label>
                    <p className="text-sm text-gray-400">
                      Die Gruppe ist für alle sichtbar und beitretbar
                    </p>
                  </div>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Mitglieder */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Mitglieder
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Aktuelle Mitglieder und Admins verwalten
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Dateninkonsistenz-Warnung */}
                {hasInconsistentData && (
                  <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-md flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-300 font-medium">Dateninkonsistenz erkannt</p>
                      <p className="text-xs text-gray-300 mt-1">
                        Einige Mitglieder haben unvollständige Daten. Klicken Sie auf "Daten reparieren", um die Datenbank zu aktualisieren.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 text-yellow-300 border-yellow-600 hover:bg-yellow-900/50"
                        onClick={handleRepairData}
                        disabled={repairingData}
                      >
                        {repairingData ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Wird repariert...
                          </>
                        ) : (
                          <>
                            <Wrench className="mr-2 h-3 w-3" />
                            Daten reparieren
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {membersLoading ? (
                  <div className="flex justify-center items-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-400">Lade Mitglieder...</span>
                  </div>
                ) : members.length === 0 ? (
                   <p className="text-center text-gray-400">Noch keine Mitglieder in dieser Gruppe.</p>
                ) : (
                  <ul className="space-y-4">
                    {members.map((member) => {
                      // Korrekte Admin-Prüfung: Vergleiche die userId des Players mit den adminIds der Gruppe
                      const isMemberAdmin = !!member.userId && (currentGroup?.adminIds.includes(member.userId) ?? false);
                      const isSelf = !!user?.playerId && member.id === user.playerId;
                      const isLoading = roleChangeLoading[member.id] ?? false;
                       // Check if this admin is the last one
                       const isLastAdmin = isMemberAdmin && currentGroup?.adminIds.length === 1;

                      return (
                        <li key={member.id} className="flex items-center justify-between gap-4 p-3 bg-gray-700/50 rounded-md">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                             {/* Placeholder Avatar - Consider fetching actual photoURL if available */}
                             <Avatar className="h-9 w-9">
                               <AvatarFallback className={`text-gray-300 ${
                                 (member as PlayerWithPlaceholder)._isPlaceholder ? 'bg-yellow-800' : 'bg-gray-600'}`}>
                                 {member.nickname?.charAt(0).toUpperCase() || "?"}
                               </AvatarFallback>
                             </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {member.nickname || "Unbekannt"}
                                {
                                  (member as PlayerWithPlaceholder)._isPlaceholder && (
                                  <span className="ml-2 text-xs text-yellow-400">(Daten unvollständig)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {
                                  (member as PlayerWithPlaceholder)._isPlaceholder 
                                  ? <span className="text-yellow-500">ID: {member.id}</span> 
                                  : member.userId ? 'Registriert' : 'Gast'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Action Buttons (only for admins, not for self) */}
                            {isCurrentUserAdmin && !isSelf && (
                              <>
                                {/* === Make Admin Button === */} 
                                {!isMemberAdmin && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`
                                          h-auto text-xs font-medium transition-colors flex items-center justify-center
                                          ${isLoading ?
                                            'text-gray-500 border-gray-600 cursor-not-allowed' // Loading state
                                            : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 border-blue-600 px-2 py-1 rounded-lg' // Style for 'Make Admin'
                                          }
                                        `}
                                        disabled={isLoading}
                                        title={"Zum Admin ernennen"}
                                      >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zum Admin ernennen'}
                                      </Button>
                                    </AlertDialogTrigger>
                                    {/* AlertDialogContent for Make Admin */}
                                    <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Zum Admin ernennen?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                          Möchten Sie die Rolle von "{member.nickname || 'diesem Mitglied'}" wirklich ändern?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-600 hover:bg-gray-500 border-gray-600 text-white">Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRoleChange(member.id, 'admin')}
                                          className={"bg-blue-600 hover:bg-blue-700 text-white"}
                                        >
                                          Ja, ernennen
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}

                                {/* === Remove Admin Button (only if member IS admin AND NOT the creator) === */} 
                                {isMemberAdmin && member.userId !== currentGroup?.createdBy && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`
                                          h-auto text-xs font-medium transition-colors flex items-center justify-center
                                          ${isLoading || isLastAdmin ? // Simplified disabled check for remove
                                            'text-gray-500 border-gray-600 cursor-not-allowed' // Loading or Last admin 
                                            : 'bg-red-800/50 text-white hover:bg-red-700/60 focus-visible:ring-red-500 rounded-md w-6 h-6 p-0' // Style for 'Remove Admin' (X icon)
                                          }
                                        `}
                                        disabled={isLoading || isLastAdmin} // Disable if loading or last admin
                                        title={isLastAdmin ? "Letzter Admin kann nicht entfernt werden" : "Admin-Status entfernen"}
                                      >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="w-4 h-4" />}
                                      </Button>
                                    </AlertDialogTrigger>
                                    {/* AlertDialogContent for Remove Admin */} 
                                    <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Admin-Status entfernen?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                          Möchten Sie die Rolle von "{member.nickname || 'diesem Mitglied'}" wirklich ändern?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-600 hover:bg-gray-500 border-gray-600 text-white">Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRoleChange(member.id, 'member')}
                                          className={"bg-red-600 hover:bg-red-700 text-white"}
                                        >
                                          Ja, entfernen
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </>
                            )}

                            {/* Admin Badge (always shown if isMemberAdmin) */}
                            {isMemberAdmin && (
                              <Badge variant="outline" className="border-green-600 text-green-400 bg-green-900/30 px-2 py-0.5">
                                <Crown className="w-3 h-3 mr-1" /> Admin
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Gefahrenzone - Nur für Admins */}
            {user && currentGroup && currentGroup.adminIds.includes(user.uid) && (
              <Card className="bg-red-900/20 border-red-900/50">
                <CardHeader>
                  <CardTitle className="text-red-300">Gefahrenzone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-200">Einladungslinks zurücksetzen</h4>
                      <p className="text-sm text-gray-400 mt-1 mb-3">
                        Macht alle aktuell gültigen Einladungslinks für diese Gruppe sofort ungültig.
                        Nützlich, wenn ein Link ungewollt verbreitet wurde.
                      </p>
                      {/* Bestätigungsdialog einbetten */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            disabled={isInvalidating}
                            className="bg-red-700 hover:bg-red-800 border-red-900 text-white"
                          >
                            {isInvalidating ? (
                                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird zurückgesetzt... </>
                            ) : (
                                "Alle Links zurücksetzen"
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Wirklich alle Links zurücksetzen?</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                               Diese Aktion kann nicht rückgängig gemacht werden. Alle Personen, die versuchen,
                               mit einem zuvor geteilten Link beizutreten, werden abgewiesen.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            {/* Angepasster Stil für Abbrechen */}
                            <AlertDialogCancel 
                              className="bg-transparent border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                              disabled={isInvalidating} // Auch hier deaktivieren
                            >
                                Abbrechen
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleInvalidateInvites}
                              className="bg-red-600 hover:bg-red-700 text-white"
                              disabled={isInvalidating} // Button im Dialog auch deaktivieren
                            >
                               Ja, zurücksetzen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {/* Hier könnten weitere gefährliche Aktionen hin, z.B. Gruppe löschen */}
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default GroupSettingsPage;
