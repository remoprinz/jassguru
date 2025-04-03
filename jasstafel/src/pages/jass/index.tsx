"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import JassKreidetafel from "@/components/layout/JassKreidetafel";

const JassPage: React.FC = () => {
  const {isAuthenticated, status} = useAuthStore();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Client-Side-Rendering aktivieren
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Auth-Check: Nur angemeldete Benutzer oder Gäste können zugreifen
  useEffect(() => {
    if (!isClient) return;

    if (!isAuthenticated() && status !== "loading") {
      router.push("/");
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
