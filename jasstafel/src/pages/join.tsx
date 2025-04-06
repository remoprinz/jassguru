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
import {LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY} from '../constants/appConstants';
import { Loader2 } from "lucide-react";

type JoinStatus = "idle" | "processing" | "success" | "error";

const JoinGroupPage: React.FC = () => {
  const router = useRouter();
  const {token} = router.query;
  const {isAuthenticated, status: authStatus, user} = useAuthStore();
  const {showNotification} = useUIStore();
  const {loadUserGroups, setCurrentGroup} = useGroupStore();

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [message, setMessage] = useState<string>("Einladung wird verarbeitet...");

  useEffect(() => {
    if (authStatus === "loading" || authStatus === "idle") {
      return;
    }

    console.log(`JOIN_PAGE useEffect - Auth status determined: ${authStatus}, Token: ${token}`);

    if (!token || typeof token !== "string") {
      setStatus("error");
      setMessage("Kein gültiger Einladungscode gefunden.");
      return;
    }

    const validToken = token;

    if (isAuthenticated() && user) {
      console.log("JOIN_PAGE useEffect: Entering Authenticated block");
      setStatus("processing");
      const processJoin = async () => {
        setMessage(`Trete Gruppe bei...`);
        try {
          const functions = getFunctions(undefined, 'europe-west1');
          const joinFunction = httpsCallable(functions, 'joinGroupByToken');
          const result = await joinFunction({token: validToken});

          // Logge das rohe Ergebnis
          console.log("JOIN_PAGE useEffect: RAW Result from joinGroupByToken function:", JSON.stringify(result));

          const data = result.data as {success: boolean; message?: string; group?: FirestoreGroup; groupId?: string};

          if (data.success) {
            setStatus("success");
            const successMsg = data.message || "Erfolgreich beigetreten!";
            setMessage(successMsg);
            showNotification({message: successMsg, type: "success"});

            if (data.group) {
                console.log("JOIN_PAGE useEffect: Group object received. Setting current group and adding to list:", data.group.name);
                useGroupStore.getState().addUserGroup(data.group); 
                setCurrentGroup(data.group);
            } else {
                console.warn("JOIN_PAGE useEffect: Success is true, but group object is missing in response! Cloud function needs update?");
                try {
                  await loadUserGroups(user.uid);
                  const updatedGroups = useGroupStore.getState().userGroups;
                   setCurrentGroup(updatedGroups.length > 0 ? updatedGroups[0] : null);
                } catch (loadError) {
                  console.error("JOIN_PAGE useEffect: Error reloading groups as fallback:", loadError);
                  setCurrentGroup(null); 
                }
            }
            
            setTimeout(() => router.replace("/start"), 1500);
          } else {
            throw new Error(data.message || "Unbekannter Fehler beim Beitritt.");
          }
        } catch (error) {
          console.error("Fehler beim Aufruf der joinGroup Cloud Function:", error);
          setStatus("error");
          let errorMessage = "Gruppe konnte nicht beigetreten werden.";
          if (error instanceof FirebaseError) {
            errorMessage = `Fehler (${error.code}): ${error.message}`;
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }
          setMessage(errorMessage);
          showNotification({message: errorMessage, type: "error"});
        }
      };
      processJoin();
    } else if (authStatus === 'unauthenticated') {
      console.log("JOIN_PAGE useEffect: Entering Unauthenticated block");
      console.log('User not authenticated, attempting to store token:', validToken);
      try {
        localStorage.setItem(LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY, validToken);
        console.log('Token stored successfully in localStorage.');
        router.replace('/auth/login');
      } catch (storageError) {
        console.error("Failed to write to localStorage:", storageError);
        setStatus("error");
        const errorMsg = "Ein interner Fehler ist aufgetreten (Speicherfehler).";
        setMessage(errorMsg);
        showNotification({message: errorMsg, type: "error"});
      }
    } else {
        console.log(`JOIN_PAGE useEffect: Reached unexpected state block. AuthStatus: ${authStatus}, IsAuthenticated: ${isAuthenticated()}, User: ${user ? user.uid : 'null'}`);
    }
  }, [authStatus, token, router, loadUserGroups, setCurrentGroup, showNotification, isAuthenticated, user]);

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

  if (status === "processing") {
    return (
      <MainLayout>
         <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <p className="ml-4">{message}</p>
         </div>
      </MainLayout>
    );
  }

  if (status === "error") {
    return (
      <MainLayout>
         <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-red-500 text-xl font-semibold">Fehler beim Beitritt</p>
            <p className="mt-2 text-gray-300">{message}</p>
            <button
               onClick={() => router.push("/start")}
               className="mt-6 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-full transition-colors duration-150"
            >
               Zur Startseite
            </button>
         </div>
      </MainLayout>
    );
  }

  if (status === "success") {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <p className="text-green-500 text-xl font-semibold">{message}</p>
          <p className="mt-2 text-gray-300">Du wirst weitergeleitet...</p>
           <div className="mt-4">
             <Loader2 className="h-8 w-8 text-white animate-spin" />
           </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
       <div className="flex items-center justify-center h-full">
         <p>Status wird ermittelt...</p>
       </div>
    </MainLayout>
  );
};

export default JoinGroupPage;

export const dynamic = 'force-dynamic';
