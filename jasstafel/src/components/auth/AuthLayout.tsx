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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center max-w-md w-full space-y-8">
        <div className="flex flex-col items-center">
          <Link href="/">
            <Image
              src="/icon-192x192.png"
              alt="Jasstafel Logo"
              width={100}
              height={100}
              className="mb-4"
            />
          </Link>
          {title && <h2 className="text-center text-3xl font-extrabold text-gray-900">{title}</h2>}
        </div>

        <div className="w-full bg-white p-8 rounded-lg shadow-md">
          {children}
        </div>

        <div className="w-full text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Jassguru.ch - Alle Rechte vorbehalten
        </div>
      </div>
    </div>
  );
} 