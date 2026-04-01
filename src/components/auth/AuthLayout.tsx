"use client";

import {ReactNode} from "react";
import {isPWA} from "@/utils/browserDetection";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({children}: AuthLayoutProps) {
  const inPWA = typeof window !== 'undefined' && isPWA();

  return (
    <div
      className="h-full w-full absolute inset-0 overflow-y-auto"
      style={inPWA ? {
        backgroundColor: '#1a1a1a',
        backgroundImage: 'url(/images/backgrounds/chalkboard-mobile.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      } : {
        backgroundColor: '#111827',
      }}
    >
      <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-2xl my-4 relative">
          <div className="w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
