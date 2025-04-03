"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useGroupStore} from "@/store/groupStore";
import MainLayout from "@/components/layout/MainLayout";
import {getFunctions, httpsCallable} from "firebase/functions";
import {FirestoreGroup} from "../types/group";
import {FirebaseError} from "firebase/app";

type JoinStatus = "idle" | "loading_auth" | "processing" | "success" | "error";

const JoinGroupPage: React.FC = () => {
  const router = useRouter();
  const {groupId} = router.query;
  const {user, status: authStatus, isAuthenticated} = useAuthStore();
  const {showNotification} = useUIStore();
  const {loadUserGroups, setCurrentGroup} = useGroupStore();

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [message, setMessage] = useState<string>("Einladung wird verarbeitet...");

  useEffect(() => {
    if (authStatus === "loading") {
      setStatus("loading_auth");
      setMessage("Authentifizierung wird geprüft...");
      return;
    }

    if (authStatus === "unauthenticated" || !user) {
      setStatus("error");
      setMessage("Du musst angemeldet sein, um einer Gruppe beizutreten. Bitte melde dich an.");
      // Optional: Redirect zum Login nach kurzer Verzögerung
      setTimeout(() => router.push("/login"), 3000);
      return;
    }

    if (authStatus === "authenticated" && user && typeof groupId === "string" && status === "idle") {
      setStatus("processing");
      setMessage(`Trete Gruppe ${groupId} bei...`);

      const processJoin = async () => {
        try {
          const functions = getFunctions();
          const joinGroupCallable = httpsCallable(functions, "joinGroup");
          const result = await joinGroupCallable({groupId});

          // Annahme: result.data enthält das FirestoreGroup Objekt oder zumindest notwendige Infos
          // Prüfen, ob data die erwartete Struktur hat (mindestens eine ID)
          const data = result.data as { success: boolean; message?: string; group?: FirestoreGroup; groupId?: string };

          if (data.success) {
            setStatus("success");
            setMessage(data.message || "Erfolgreich beigetreten!");
            showNotification({message: "Erfolgreich beigetreten!", type: "success"});

            // Store aktualisieren und zur Startseite
            if (user?.uid) { // Sicherstellen, dass user.uid existiert
              await loadUserGroups(user.uid); // Korrekter Aufruf mit userId
            }

            // Prüfen, ob das ganze Objekt oder nur die ID zurückkam
            if (data.group) {
              setCurrentGroup(data.group); // Gruppe direkt setzen
            } else if (data.groupId) {
              // Fallback: Gruppe manuell laden (Implementierung von getGroupById wäre nötig)
              console.warn("Cloud function gab nur groupId zurück, nicht das Objekt. Gruppe muss manuell geladen werden.");
              // const fetchedGroup = await getGroupById(data.groupId); // Braucht getGroupById Funktion
              // setCurrentGroup(fetchedGroup);
              setCurrentGroup(null); // Vorerst null setzen, bis getGroupById implementiert ist
            } else {
              setCurrentGroup(null); // Fallback, wenn keine Gruppeninfo zurückkam
            }

            setTimeout(() => router.push("/start"), 2000);
          } else {
            throw new Error(data.message || "Unbekannter Fehler beim Beitritt.");
          }
        } catch (error) {
          console.error("Fehler beim Aufruf der joinGroup Cloud Function:", error);
          setStatus("error");
          let errorMessage = "Gruppe konnte nicht beigetreten werden.";
          if (error instanceof FirebaseError) {
            // Spezifischere Firebase-Fehler behandeln
            errorMessage = `Fehler (${error.code}): ${error.message}`;
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }
          setMessage(errorMessage);
          showNotification({message: errorMessage, type: "error"});
          setTimeout(() => router.push("/groups"), 3000); // Zurück zur Gruppenübersicht
        }
      };

      processJoin();
    }
  }, [authStatus, user, groupId, status, router, loadUserGroups, setCurrentGroup, showNotification]);

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
        <h1 className="text-2xl font-bold mb-4">Gruppe beitreten</h1>
        {status === "loading_auth" && <p>Authentifizierung wird geprüft...</p>}
        {status === "processing" && <p>{message}</p>}
        {status === "success" && <p className="text-green-500">{message}</p>}
        {status === "error" && <p className="text-red-500">{message}</p>}
        {(status === "processing" || status === "loading_auth") && (
          <div className="mt-4">
            {/* Optional: Loading Spinner */}
            <svg className="animate-spin h-8 w-8 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default JoinGroupPage;
