"use client";

import React from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
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

const Header: React.FC<HeaderProps> = ({
  showBackButton = false,
  title,
}) => {
  const {user, isGuest, logout} = useAuthStore();
  const router = useRouter();

  const handleProfileClick = () => {
    if (isGuest) {
      router.push("/auth/login");
    }
  };

  return (
    <header className="sticky top-0 z-10 w-full bg-gray-800 shadow-md pt-12 pb-2">
      <div className="w-full flex items-center justify-between px-4">
        <div className="flex items-center">
          {showBackButton && (
            <button
              onClick={() => router.back()}
              className="mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-300 hover:bg-gray-700 transition-colors"
              aria-label="Zurück"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {title && (
            <Link href="/start">
              <h1 className="text-xl font-bold text-white">{title}</h1>
            </Link>
          )}
        </div>

        {!isGuest ? (
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
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-400 hover:bg-red-900/50 focus:bg-red-900/50">
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
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
        )}
      </div>
    </header>
  );
};

export default Header;
