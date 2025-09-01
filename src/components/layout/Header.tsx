"use client";

import React from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import Image from "next/image";
import Link from "next/link";
import {FaUser} from "react-icons/fa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  showBackButton?: boolean;
  title?: string;
}

const Header: React.FC<HeaderProps> = () => {
  const {user, isGuest, logout} = useAuthStore();
  const router = useRouter();
  const headerConfig = useUIStore((state) => state.headerConfig);

  const handleProfileClick = () => {
    if (isGuest) {
      router.push("/auth/login");
    }
  };

  const effectiveTitle = headerConfig?.title;
  const showEffectiveBackButton = headerConfig?.showBackButton ?? false;
  
  // 🔧 FIX: Spezielle Zurück-Navigation für Auth-Seiten
  const backButtonAction = headerConfig?.backButtonAction ?? (() => {
    // Auf Login/Register-Seiten: Unterscheide zwischen eingeloggt und nicht eingeloggt
    if (router.pathname === '/auth/login' || router.pathname === '/auth/register' || router.pathname === '/auth/reset-password') {
      if (user) {
        // Eingeloggte Benutzer zur Startseite
        router.push('/start');
      } else {
        // Nicht eingeloggte Benutzer zur WelcomeScreen
        router.push('/');
      }
    } else {
      router.back();
    }
  });
  
  const showEffectiveProfileButton = headerConfig?.showProfileButton ?? true;

  const shouldShowHeader = effectiveTitle || showEffectiveBackButton || showEffectiveProfileButton;

  // Explizit den Header auf dem WelcomeScreen und öffentlichen Views ausblenden
  if (router.pathname === '/' || 
      router.pathname === '/join' ||
      router.pathname.startsWith('/view/') ||  // Alle /view/* Seiten (group, session, tournament, game)
      (router.pathname.startsWith('/profile/') && router.pathname !== '/profile' && router.pathname !== '/profile/edit' && router.pathname !== '/profile/groups')) {
    return null;
  }

  if (!shouldShowHeader) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 w-full bg-gray-800 shadow-md pt-12 pb-2">
      <div className="w-full flex items-center justify-between px-4">
        <div className="flex items-center">
          {showEffectiveBackButton && (
            <button
              onClick={backButtonAction}
              className="mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-300 hover:bg-gray-700 transition-colors"
              aria-label="Zurück"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {effectiveTitle && (
            <h1 className="text-xl font-bold text-white">{effectiveTitle}</h1>
          )}
        </div>

        {showEffectiveProfileButton && !isGuest ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex cursor-pointer items-center">
                <div className="mr-3 text-right">
                  <span className="block text-sm font-medium text-white">
                    {user?.displayName || "Profil"}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {user?.email || ""}
                  </span>
                </div>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-700">
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt="Profilbild"
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-blue-600 text-white">
                      {user?.displayName ? (
                        <span className="text-base font-semibold">
                          {user.displayName[0]?.toUpperCase()}
                        </span>
                      ) : (
                        <FaUser className="h-5 w-5 text-gray-300" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mr-2 bg-gray-700 border-gray-600 text-white" align="end">
              <DropdownMenuLabel className="text-gray-400">Mein Konto</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-600"/>
              <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer hover:bg-gray-600 focus:bg-gray-600">
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/profile/groups')} className="cursor-pointer hover:bg-gray-600 focus:bg-gray-600">
                Meine Gruppen
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-600"/>
              <DropdownMenuItem 
                onClick={async () => {
                  try {
                    console.log('🚪 [Header] Logout-Prozess gestartet...');
                    await logout();
                    console.log('🚪 [Header] Logout erfolgreich, navigiere zur WelcomeScreen...');
                    
                    // Zusätzliche Navigation-Zusicherung nach kurzer Verzögerung
                    setTimeout(() => {
                      if (router.pathname !== '/') {
                        console.log('🚪 [Header] Erzwinge Navigation zur WelcomeScreen...');
                        router.push('/');
                      }
                    }, 300);
                  } catch (error) {
                    console.error('🚪 [Header] Logout-Fehler:', error);
                    // Fallback: Direkte Navigation zur WelcomeScreen
                    router.push('/');
                  }
                }} 
                className="cursor-pointer text-red-400 hover:bg-red-900/50 focus:bg-red-900/50"
              >
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : showEffectiveProfileButton && isGuest ? (
          <div
            className="flex cursor-pointer items-center"
            onClick={handleProfileClick}
          >
            <div className="mr-3 text-right">
              <span className="block text-sm font-medium text-white">Gast</span>
              <span className="block text-xs text-gray-400">Anmelden</span>
            </div>
            <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-700">
              <div className="flex h-full w-full items-center justify-center bg-gray-600 text-white">
                <FaUser className="h-5 w-5 text-gray-300" />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ width: '40px' }} />
        )}
      </div>
    </header>
  );
};

export default Header;
