"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft, Users, Globe, Settings} from "lucide-react";
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

const GroupSettingsPage: React.FC = () => {
  const {user, status, isAuthenticated} = useAuthStore();
  const {currentGroup, updateGroup} = useGroupStore();
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

  // Redirect wenn nicht eingeloggt oder keine aktive Gruppe
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated()) {
        router.push("/");
      } else if (!currentGroup) {
        router.push("/start");
      } else if (!user || !currentGroup.adminIds.includes(user.uid)) {
        router.push("/start");
      }
    }
  }, [status, isAuthenticated, router, currentGroup, user]);

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
    if (!currentGroup) return;

    setIsInvalidating(true);
    try {
      const functions = getFunctions();
      const invalidateFn = httpsCallable(functions, "invalidateActiveGroupInvites");
      const result = await invalidateFn({groupId: currentGroup.id});

      const data = result.data as { success: boolean; invalidatedCount: number };

      if (data.success) {
        showNotification({
          message: `${data.invalidatedCount} Einladungslink(s) erfolgreich zurückgesetzt.`,
          type: "success",
        });
      } else {
        throw new Error("Fehler beim Zurücksetzen der Links.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Zurücksetzen der Links.";
      console.error("Error calling invalidateActiveGroupInvites:", error);
      showNotification({
        message: message,
        type: "error",
      });
    } finally {
      setIsInvalidating(false);
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
                  Aktuelle Mitglieder und Admins
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-200 mb-2">Admins</h4>
                    <div className="space-y-2">
                      {currentGroup?.adminIds.map((adminId) => (
                        <div key={adminId} className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                          <span className="text-sm text-gray-200">
                            {currentGroup.players?.[adminId]?.displayName || "Unbekannt"}
                          </span>
                          <span className="text-xs text-gray-400">Admin</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200 mb-2">Mitglieder</h4>
                    <div className="space-y-2">
                      {currentGroup?.playerIds
                        .filter((id) => !currentGroup.adminIds.includes(id))
                        .map((playerId) => (
                          <div key={playerId} className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                            <span className="text-sm text-gray-200">
                              {currentGroup.players?.[playerId]?.displayName || "Unbekannt"}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
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
                            {isInvalidating ? "Wird zurückgesetzt..." : "Alle Links zurücksetzen"}
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
                            <AlertDialogCancel className="text-gray-300 border-gray-600 hover:bg-gray-700">Abbrechen</AlertDialogCancel>
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
