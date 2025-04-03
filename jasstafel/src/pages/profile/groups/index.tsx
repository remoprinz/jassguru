"use client";

import React, {useEffect} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {useAuthStore} from "@/store/authStore";
import MainLayout from "@/components/layout/MainLayout";
import {GroupSelector} from "@/components/group/GroupSelector"; // Import the GroupSelector
import {Button} from "@/components/ui/button";

const GroupsPage: React.FC = () => {
  const {user, status, isAuthenticated, isGuest} = useAuthStore();
  const router = useRouter();

  // Redirect if not authenticated or if guest, only check on definitive statuses
  useEffect(() => {
    // Only run the check if the auth status is definitive (not loading or idle)
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated() || isGuest) { // Check if user is actually NOT allowed
        console.log("GroupsPage: User not authenticated or is guest, redirecting...");
        router.push("/"); // Redirect to home or login page
      }
      // If authenticated and not guest, do nothing - allow rendering
    }
    // During 'loading' or 'idle', wait for status to resolve
  }, [status, isAuthenticated, isGuest, router]); // Dependencies remain the same

  // Show loading state while auth status is being determined
  if (status === "loading" || status === "idle") {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  // Render page content ONLY if definitively authenticated and not a guest
  // The useEffect above handles redirection for all other cases.
  if (status === "authenticated" && !isGuest) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
          {/* Back Button */}
          <Link href="/profile" passHref legacyBehavior>
            <Button
              variant="ghost"
              className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
              aria-label="Zurück zur Profilseite"
            >
              <ArrowLeft size={28} />
            </Button>
          </Link>

          <div className="w-full max-w-md space-y-6 py-16"> {/* Added padding top */}
            <h1 className="text-center text-2xl font-bold text-white">
              Meine Gruppen
            </h1>

            {/* Group Selector Component */}
            <div className="rounded-lg bg-gray-800 p-4 shadow-md">
              <p className="text-sm text-gray-400 mb-3">Wähle deine aktive Gruppe:</p>
              {/* *** GroupSelector wird wieder gerendert *** */}
              <GroupSelector />
              {/* *** Test-Div entfernt *** */}
              {/* <div style={{ color: 'cyan', border: '1px solid cyan', padding: '5px' }}>Simple Div Test</div> */}
            </div>

            {/* Placeholder for future actions like "Create Group" */}
            <div className="mt-6 text-center">
              {/* Example: Button to navigate to a create group page */}
              {/*
              <Button
                onClick={() => router.push('/groups/create')}
                variant="outline"
                className="border-purple-500 text-purple-300 hover:bg-purple-900/50 hover:text-purple-200"
              >
                Neue Gruppe erstellen
              </Button>
              */}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // In other cases (e.g., status 'unauthenticated', 'error', or guest),
  // the component will render null while the useEffect handles the redirect.
  console.log(`GroupsPage: Not rendering main content, awaiting redirect or state change. Status: ${status}, isGuest: ${isGuest}`);
  return null;
};

export default GroupsPage;
