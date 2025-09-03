"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import JassKreidetafel from "@/components/layout/JassKreidetafel";

const JassPage: React.FC = () => {
  // Holen isGuest direkt aus dem Store für Gast-Check
  const {isAuthenticated, status, isGuest} = useAuthStore();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Client-Side-Rendering aktivieren
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Auth-Check: Prüfe SOWOHL eingeloggte Benutzer ALS AUCH Gäste
  useEffect(() => {
    if (!isClient) return;

    // Neu: Überprüfe ob der Benutzer authentifiziert ODER ein Gast ist
    const authStore = useAuthStore.getState();

                
    if (!isAuthenticated() && !authStore.isGuest && status !== "loading") {
      console.log("[JassPage] Benutzer ist weder authentifiziert noch Gast, Weiterleitung zur Startseite");
      router.push("/");
    } else {

    }
  }, [isAuthenticated, status, router, isClient]);

  // Anzeige während des Ladens
  if (!isClient || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div>Laden...</div>
      </div>
    );
  }

  // Konfiguration für die ZShape innerhalb der JassKreidetafel
  const zShapeConfig = {
    innerSpacing: 50,
    sideSpacing: 40,
    edgeSpacing: 70,
  };

  return (
    <JassKreidetafel
      zShapeConfig={zShapeConfig}
      middleLineThickness={4}
    />
  );
};

export default JassPage;
