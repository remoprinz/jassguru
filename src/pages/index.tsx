"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import WelcomeScreen from "@/components/auth/WelcomeScreen";
import {useAuthStore} from "@/store/authStore";
import {isPWA} from "@/utils/browserDetection";
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import type { FirestoreGroup } from "@/types/jass";
import { Users } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";

// Einfache isDesktopDevice-Funktion für die Geräteerkennung
function isDesktopDevice(): boolean {
  if (typeof window !== "undefined") {
    // Keine Touch-Unterstützung deutet auf Desktop hin
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      return true;
    }
    // Große Bildschirme sind wahrscheinlich Desktops (>= 1024px)
    if (window.innerWidth >= 1024) {
      return true;
    }
  }
  return false;
}

export default function Home() {
  const router = useRouter();
  const {status, isGuest} = useAuthStore();
  const [isClient, setIsClient] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [publicGroups, setPublicGroups] = useState<FirestoreGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Client-Side Rendering aktivieren
  useEffect(() => {
    setIsClient(true);

    // PWA-Status überprüfen
    const pwaInstalled = isPWA();
    setIsPWAInstalled(pwaInstalled);

    // Desktop-Status überprüfen (für QR-Code)
    setIsDesktop(isDesktopDevice());

    const fetchPublicGroups = async () => {
      try {
        setLoadingGroups(true);
        const db = getFirestore(firebaseApp);
        const groupsRef = collection(db, "groups");
        
        // Abfrage nach öffentlichen Gruppen, sortiert nach Erstellungsdatum (neueste zuerst)
        const q = query(
          groupsRef,
          where("isPublic", "==", true),
          // orderBy("createdAt", "desc") ist auskommentiert, bis der Firestore-Index erstellt ist
          // Besuche: https://console.firebase.google.com/v1/r/project/jassguru/firestore/indexes?create_composite=Ckdwcm9qZWN0cy9qYXNzZ3VydS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvZ3JvdXBzL2luZGV4ZXMvXxABGgwKCGlzUHVibGljEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg
          limit(6) // Begrenze auf 6 Gruppen
        );
        
        const querySnapshot = await getDocs(q);
        const groups: FirestoreGroup[] = [];
        
        querySnapshot.forEach((doc) => {
          groups.push({ id: doc.id, ...doc.data() } as FirestoreGroup);
        });
        
        setPublicGroups(groups);
      } catch (error) {
        console.error("Fehler beim Laden öffentlicher Gruppen:", error);
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchPublicGroups();
  }, []);

  // Server-Rendering vermeiden
  if (!isClient) {
    return null;
  }

  // Zeige *immer* den WelcomeScreen, wenn der Client bereit ist.
  // Die Logik, ob Onboarding Flow gezeigt wird, liegt in JassKreidetafel.
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-4 pt-8">
        <WelcomeScreen />
        
        <div className="text-center mb-8">
          <p className="text-lg text-gray-300">
            Deine digitale Jasstafel
          </p>
        </div>
        
        {/* Public Groups Section */}
        <div className="w-full max-w-md mt-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center">
            <Users className="w-6 h-6 mr-2" />
            Öffentliche Gruppen
          </h2>
          
          {loadingGroups ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
              <span className="ml-3 text-gray-300">Lade Gruppen...</span>
            </div>
          ) : publicGroups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {publicGroups.map(group => (
                <Link key={group.id} href={`/view/group/${group.id}`} passHref>
                  <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition duration-200 cursor-pointer flex flex-col h-full">
                    <div className="flex items-center mb-2">
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden mr-3">
                        {group.logoUrl ? (
                          <Image
                            src={group.logoUrl}
                            alt={group.name}
                            width={40}
                            height={40}
                            className="object-cover w-full h-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-logo.png';
                            }}
                          />
                        ) : (
                          <span className="text-lg font-bold text-gray-400">
                            {group.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{group.name}</h3>
                        <p className="text-xs text-gray-400">{group.playerIds?.length || 0} Mitglieder</p>
                      </div>
                    </div>
                    {group.description && (
                      <p className="text-sm text-gray-300 line-clamp-2 mt-auto">
                        {group.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center p-6 bg-gray-800 rounded-lg">
              <p className="text-gray-400">Keine öffentlichen Gruppen gefunden.</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
