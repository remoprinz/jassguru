import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { Toaster } from 'sonner';

interface SupportLayoutProps {
  children: React.ReactNode;
  headerSearch?: React.ReactNode;
}

const SupportLayout: React.FC<SupportLayoutProps> = ({ children, headerSearch }) => {
  return (
    <div className="flex flex-col h-full chalkboard-bg overflow-y-auto">
      {/* Sticky header with integrated search */}
      <header
        className="sticky top-0 z-20 backdrop-blur-xl bg-gray-900/70 border-b border-white/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Top row: Logo + Back link */}
          <div className="h-12 flex items-center justify-between">
            <Link href="/start" className="flex items-center shrink-0">
              <Image
                src="/images/logos/jassguru-logo-weiss.svg"
                alt="JassGuru"
                width={200}
                height={36}
                className="h-6 w-auto"
              />
            </Link>
            <Link
              href="/start"
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Zurück zur App</span>
              <span className="sm:hidden">Zurück</span>
            </Link>
          </div>

          {/* Search row (always visible if provided) */}
          {headerSearch && (
            <div className="pb-3">
              {headerSearch}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 pb-16 w-full">
        {children}
      </main>

      <Toaster position="bottom-center" richColors />
    </div>
  );
};

export default SupportLayout;
