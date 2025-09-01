"use client";

import React from "react";
import {useRouter} from "next/router";
import MainLayout from "@/components/layout/MainLayout";
import Header from "@/components/layout/Header";
import {useGroupStore} from "@/store/groupStore";
import {useAuthStore} from "@/store/authStore";

const GroupDetailPage: React.FC = () => {
  const router = useRouter();
  const {groupId} = router.query;
  const {currentGroup} = useGroupStore();
  const {status, isGuest} = useAuthStore();

  // TODO: Implement full functionality
  // - Fetch group details if not currentGroup or accessed directly
  // - Display group info (logo, name, description)
  // - Show members list
  // - Implement admin actions (invite, promote, edit description)
  // - Implement member actions (leave group)

  React.useEffect(() => {
    // Redirect guests or unauthenticated users
    if (status === "authenticated" && isGuest) {
      router.push("/");
    }
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, isGuest, router]);

  if (status === "loading") {
    return <MainLayout><div>Laden...</div></MainLayout>;
  }

  // Handle case where group might not be loaded yet or ID doesn't match
  const groupName = currentGroup && currentGroup.id === groupId ? currentGroup.name : "Gruppe laden...";

  return (
    <MainLayout>
      {/* Verwende Header für Konsistenz, Linkziel zur Gruppenliste */}
      <Header title={groupName || "Gruppendetail"} showBackButton={true} />
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-900 p-4 text-white">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-xl font-bold">Gruppen-ID: {groupId}</h1>
          <p>Details für Gruppe {groupName}</p>
          <p className="text-yellow-500">(Platzhalter - Funktionalität folgt)</p>

          {/* TODO: Add Button to navigate to group list */}
          <button
            onClick={() => router.push("/profile/groups")}
            className="mt-4 text-blue-400 hover:underline"
          >
            Zurück zur Gruppenliste (Gruppe wechseln)
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default GroupDetailPage;
