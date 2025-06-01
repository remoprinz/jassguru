"use client";

// console.log('<<<< EXECUTE JOIN.TSX - VERSION DEBUG_001 >>>>'); // Eindeutige Log-Meldung

import React, {useEffect, useState, useRef} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useGroupStore} from "@/store/groupStore";
import MainLayout from "@/components/layout/MainLayout";
import {getFunctions, httpsCallable, FunctionsErrorCode} from "firebase/functions";
import type { FirestoreGroup } from "@/types/jass";
import {FirebaseError} from "firebase/app";
import {LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY} from '../constants/appConstants';
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from '@/components/ui/button';
import { redeemTournamentInvite } from '@/services/tournamentService';
import { getGroupToken, getTournamentToken, clearGroupToken, clearTournamentToken } from '@/utils/tokenStorage';

type JoinPageStatus = "idle" | "processing" | "success" | "error";

// Typ für das Ergebnis der Cloud Functions
interface CloudJoinResult {
  success: boolean;
  alreadyMember?: boolean;
  group?: any; // Gruppe kann ein beliebiges Objekt sein, das von der CF kommt
  groupId?: string; // Wird von CF `joinGroupByToken` zurückgegeben
  tournamentId?: string; // Wird von CF `acceptTournamentInviteFunction` zurückgegeben
  message?: string; // Fehlermeldung von der CF
}

const JoinGroupPage: React.FC = () => {
  const router = useRouter();
  const {isAuthenticated, status: authStatus, user} = useAuthStore();
  const {showNotification, setLoading} = useUIStore();
  const {setCurrentGroup} = useGroupStore();
  // loadUserGroups und setCurrentGroup werden hier nicht direkt verwendet, können ggf. später für groupToken relevant werden
  // const {loadUserGroups, setCurrentGroup} = useGroupStore(); 

  // Neuer Ref, um zu verhindern, dass der Token mehrfach verarbeitet wird
  const hasProcessedToken = useRef(false);

  const [message, setMessage] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<JoinPageStatus>("idle");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Token-Extraktion direkt hier, um sie in der Abhängigkeitsliste verwenden zu können
  const { token: genericToken, tournamentToken: queryTournamentTokenFromRouter, groupToken: queryGroupTokenFromRouter } = router.query;

  useEffect(() => {
    // Konvertiere zu String oder undefined, um Konsistenz sicherzustellen (Query-Parameter können string[] sein)
    const currentQueryTournamentToken = Array.isArray(queryTournamentTokenFromRouter) ? queryTournamentTokenFromRouter[0] : queryTournamentTokenFromRouter;
    // In queryGroupTokenFromRouter umbenannt, um Verwechslung mit der Endvariablen zu vermeiden
    let extractedGroupToken = Array.isArray(queryGroupTokenFromRouter) ? queryGroupTokenFromRouter[0] : queryGroupTokenFromRouter;
    const currentGenericToken = Array.isArray(genericToken) ? genericToken[0] : genericToken;

    // Fallback: Wenn kein expliziter groupToken da ist, aber ein generischer 'token', nutze diesen.
    if (!extractedGroupToken && currentGenericToken) {
      console.log('[JOIN_PAGE_EFFECT] Generic "token" found and no explicit groupToken, using generic token as groupToken.');
      extractedGroupToken = currentGenericToken;
    }

    if (!router.isReady || authStatus === 'idle') {
      return;
    }

    if (!hasProcessedToken.current && (currentQueryTournamentToken || extractedGroupToken)) {
      hasProcessedToken.current = true;
      
      const processTokensLogic = async () => {
        setPageStatus("processing");
        
        if (!extractedGroupToken && !currentQueryTournamentToken) {
          console.error('[PROCESS_TOKENS_LOGIC] Error: No group or tournament token found.');
          setMessage("Kein Einladungscode im Link gefunden.");
          setErrorDetails("Weder in der URL noch im lokalen Speicher war ein Code vorhanden.");
          setPageStatus("error");
          clearGroupToken();
          clearTournamentToken();
          return;
        }

        if (authStatus === 'loading') {
          return; 
        }

        if (!isAuthenticated()) {
          showNotification({ message: "Bitte melde dich an, um der Einladung zu folgen.", type: "info" });
          const loginRedirectQuery = { redirect: router.asPath }; 
          router.push({ pathname: '/auth/login', query: loginRedirectQuery });
          return;
        }
        
        if (!user) {
          console.error('[PROCESS_TOKENS_LOGIC] Error: User object is null/undefined despite being authenticated.');
          setMessage("Benutzerdaten nicht geladen. Bitte versuche es erneut.");
          setErrorDetails("Benutzerdaten nicht geladen. Bitte versuche es erneut.");
          setPageStatus("error");
          return;
        }

        setLoading(true); 

        let resultData: CloudJoinResult | null = null;
        let successRedirectionPath: string | null = null;
        let uiMessage: string = "";
        let finalStatus: JoinPageStatus = "idle";

        if (currentQueryTournamentToken) {
          setMessage("Bearbeite Turniereinladung...");
          try {
            const tournamentResult = await redeemTournamentInvite(currentQueryTournamentToken);
            if (tournamentResult.success && tournamentResult.tournamentId) {
              showNotification({ message: tournamentResult.message || "Erfolgreich dem Turnier beigetreten!", type: "success" });
              setPageStatus("success");
              setMessage(tournamentResult.message || "Erfolgreich dem Turnier beigetreten!");
              successRedirectionPath = `/view/tournament/${tournamentResult.tournamentId}`;
              clearTournamentToken();
              finalStatus = "success";
            } else {
              console.error('[PROCESS_TOKENS_LOGIC] Error redeeming tournament token:', tournamentResult.message);
              setMessage(tournamentResult.message || "Fehler beim Beitritt zum Turnier.");
              setErrorDetails(tournamentResult.message || "Fehler beim Beitritt zum Turnier.");
              setPageStatus("error");
              showNotification({ message: tournamentResult.message || "Fehler beim Beitritt zum Turnier.", type: "error" });
              finalStatus = "error";
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Ein unerwarteter Fehler ist aufgetreten.";
            console.error('[PROCESS_TOKENS_LOGIC] Exception redeeming tournament token:', errorMsg);
            setMessage(errorMsg);
            setErrorDetails(errorMsg);
            setPageStatus("error");
            showNotification({ message: errorMsg, type: "error" });
            finalStatus = "error";
          }
        } else if (extractedGroupToken) {
          setMessage("Gruppeneinladung wird verarbeitet..."); 
          try {
            const functions = getFunctions(undefined, 'europe-west1');
            const joinFunction = httpsCallable<{
              token: string;
            }, CloudJoinResult>(functions, 'joinGroupByToken');
            
            let response;
            try {
              response = await joinFunction({ token: extractedGroupToken });
            } catch (callError) {
              console.error('[PROCESS_TOKENS_LOGIC] Error calling joinGroupByToken:', callError);
              throw callError;
            }
            
            resultData = response.data;
            
            if (resultData && resultData.success && resultData.group?.id) {
              try {
                const groupStore = useGroupStore.getState();
                groupStore.addUserGroup(resultData.group);
                groupStore.setCurrentGroup(resultData.group);
              } catch (storeError) {
                console.error('[PROCESS_TOKENS_LOGIC] Error updating group store:', storeError);
              }
              
              uiMessage = resultData.alreadyMember 
                ? "Du bist bereits Mitglied dieser Gruppe." 
                : "Du bist erfolgreich der Gruppe beigetreten!";
              
              showNotification({ message: uiMessage, type: "success" });
              setPageStatus("success");
              setMessage(uiMessage);
              successRedirectionPath = "/start";
              clearGroupToken();
              finalStatus = "success";
            } else {
              console.error('[PROCESS_TOKENS_LOGIC] Cloud Function reported failure:', resultData);
              uiMessage = resultData?.message || "Der Beitritt zur Gruppe ist fehlgeschlagen. Bitte versuche es erneut oder prüfe den Code.";
              setErrorDetails(uiMessage);
              setPageStatus("error");
              if (showNotification) showNotification({ message: uiMessage, type: "error" });
              finalStatus = "error";
            }
          } catch (e) {
            const isFirebaseError = e instanceof FirebaseError;
            const errorCode = isFirebaseError ? (e as FirebaseError).code : 'unknown';
            const errorMsg = e instanceof Error ? e.message : "Ein unerwarteter Fehler ist aufgetreten.";
            
            console.error('[PROCESS_TOKENS_LOGIC] Exception joining group:', errorMsg);
            if (isFirebaseError) {
              console.error('[PROCESS_TOKENS_LOGIC] Firebase error code:', errorCode);
            }
            
            setMessage("Fehler beim Beitritt zur Gruppe.");
            setErrorDetails(errorMsg);
            setPageStatus("error");
            if (showNotification) {
showNotification({ 
              message: `Fehler: ${errorMsg.substring(0, 100)}${errorMsg.length > 100 ? '...' : ''}`, 
              type: "error" 
            });
}
            finalStatus = "error";
          }
        } 

        setPageStatus(finalStatus);
        if (finalStatus === "error") setErrorDetails(uiMessage);

        if (showNotification) {
            if (finalStatus === "success" && uiMessage) showNotification({ message: uiMessage, type: "success" });
            else if (finalStatus === "error" && uiMessage) showNotification({ message: uiMessage, type: "error" });
        }
        
        setLoading(false); 

        if (finalStatus === "success" && successRedirectionPath) {
          setTimeout(() => {
            router.push(successRedirectionPath!);
          }, 1500);
        } 
      };
      processTokensLogic();
    }
  }, [router.isReady, queryTournamentTokenFromRouter, queryGroupTokenFromRouter, genericToken, authStatus, isAuthenticated, user, showNotification, setLoading, router.asPath, setCurrentGroup]);

  if (authStatus === "loading" || authStatus === "idle") {
    return (
      <MainLayout>
         <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <p className="ml-4">Authentifizierung wird geprüft...</p>
         </div>
      </MainLayout>
    );
  }

  if (pageStatus === "processing") {
    return (
      <MainLayout>
         <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <p className="ml-4">{message || "Einladung wird verarbeitet..."}</p>
         </div>
      </MainLayout>
    );
  }

  if (pageStatus === "error") {
    return (
      <MainLayout>
         <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-red-500 text-xl font-semibold">Fehler beim Beitritt</p>
            <p className="mt-2 text-gray-300">{message}</p>
            {errorDetails && <p className="text-xs text-gray-400 mt-1">Detail: {errorDetails}</p>} {/* errorDetails Anzeige hinzugefügt */}
            <Button onClick={() => router.push("/start")} variant="default" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">Zur Startseite</Button>
         </div>
      </MainLayout>
    );
  }

  if (pageStatus === "success") {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" /> {/* Icon für Erfolg hinzugefügt */}
          <p className="text-green-500 text-xl font-semibold">{message}</p>
          <p className="mt-2 text-gray-300">Du wirst weitergeleitet...</p>
           <div className="mt-4">
             <Loader2 className="h-8 w-8 text-white animate-spin" />
           </div>
        </div>
      </MainLayout>
    );
  }

  // Fallback, sollte idealerweise nicht erreicht werden, wenn pageStatus immer gesetzt wird
  return (
    <MainLayout>
       <div className="flex items-center justify-center h-full">
         <Loader2 className="h-8 w-8 text-white animate-spin" />
         <p className="ml-4">Status wird ermittelt...</p>
       </div>
    </MainLayout>
  );
};

export default JoinGroupPage;

export const dynamic = 'force-dynamic';
