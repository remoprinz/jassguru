'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AuthLayout({ children, title }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-6 px-4 sm:px-6 lg:px-8 sm:py-12">
      <div className="flex flex-col items-center max-w-md w-full space-y-4 sm:space-y-6">
        <div className="flex flex-col items-center hidden sm:flex">
          <Link href="/">
            <Image
              src="/welcome-guru.png"
              alt="Jasstafel Logo"
              width={80}
              height={80}
              className="mb-4"
            />
          </Link>
          {title && <h2 className="text-center text-3xl font-extrabold text-white">{title}</h2>}
        </div>

        {children}

        <div className="w-full text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Jassguru.ch - Alle Rechte vorbehalten
        </div>
      </div>
    </div>
  );
} 