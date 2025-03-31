'use client';

import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { FaHome, FaPlus, FaGamepad, FaUser } from 'react-icons/fa';
import { useAuthStore } from '@/store/authStore';
import { BottomNavigation } from './BottomNavigation';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { isAuthenticated, isGuest } = useAuthStore();
  
  // Prüfe, ob ein Navigationselement aktiv ist
  const isActive = (path: string) => {
    return router.pathname === path || router.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-900">
      {/* Hauptinhalt */}
      <main className="flex-grow relative">
        {children}
      </main>

      {/* Navigationsleiste am unteren Bildschirmrand */}
      <nav className="bg-gray-800 text-white pt-1 pb-safe">
        <div className="flex justify-around items-center">
          <Link href="/jass">
            <div className={`flex flex-col items-center p-2 ${isActive('/jass') ? 'text-blue-400' : 'text-gray-400'}`}>
              <FaHome className="h-6 w-6 mb-1" />
              <span className="text-xs">Home</span>
            </div>
          </Link>
          
          <Link href="/game/new">
            <div className={`flex flex-col items-center p-2 ${isActive('/game/new') ? 'text-blue-400' : 'text-gray-400'}`}>
              <FaPlus className="h-6 w-6 mb-1" />
              <span className="text-xs">Neues Spiel</span>
            </div>
          </Link>
          
          <Link href="/game/continue">
            <div className={`flex flex-col items-center p-2 ${isActive('/game/continue') ? 'text-blue-400' : 'text-gray-400'}`}>
              <FaGamepad className="h-6 w-6 mb-1" />
              <span className="text-xs">Fortsetzen</span>
            </div>
          </Link>
          
          {!isGuest && (
            <Link href="/profile">
              <div className={`flex flex-col items-center p-2 ${isActive('/profile') ? 'text-blue-400' : 'text-gray-400'}`}>
                <FaUser className="h-6 w-6 mb-1" />
                <span className="text-xs">Profil</span>
              </div>
            </Link>
          )}
        </div>
      </nav>
      <BottomNavigation />
    </div>
  );
};

export default MainLayout; 