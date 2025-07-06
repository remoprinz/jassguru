"use client";

import {ReactNode} from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({children}: AuthLayoutProps) {
  return (
    <div className="h-full w-full absolute inset-0 bg-gray-900 overflow-y-auto">
      <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-2xl my-4 relative">
          <div className="w-full">
            {children}
          </div>
        </div>

        <div className="text-center text-gray-500 text-sm py-4">
          &copy; {new Date().getFullYear()} jassguru.ch - Alle Rechte vorbehalten
        </div>
      </div>
    </div>
  );
}
