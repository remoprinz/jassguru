import React, { useState, useEffect } from 'react';
import { LexikonSidebar } from './LexikonSidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { SearchBar } from '@/components/wissen/SearchBar';
import { Menu, X, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface BreadcrumbItem {
  name: string;
  href: string;
}

interface LexikonLayoutProps {
  children: React.ReactNode;
  breadcrumbItems: BreadcrumbItem[]; 
}

export const LexikonLayout: React.FC<LexikonLayoutProps> = ({ children, breadcrumbItems }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  
  // Prüfe ob wir in der PWA sind für spezifisches Styling
  const [isPWA, setIsPWA] = useState(false);
  
  useEffect(() => {
    const checkPWA = () => {
      // Sicherheitsprüfung für Browser-APIs
      if (typeof window === 'undefined') return;
      
      const pwaCheck = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true ||
                      document.referrer.includes('android-app://');
      setIsPWA(pwaCheck);
    };
    
    checkPWA();
    
    // Prüfe auch bei Resize (falls sich der Modus ändert)
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkPWA);
      return () => window.removeEventListener('resize', checkPWA);
    }
  }, []);

  // Bestimme das Zurück-Ziel basierend auf der aktuellen Route und PWA-Status
  const getBackHref = () => {
    // Sicherheitsprüfung für Browser-APIs
    if (typeof window === 'undefined') return '/wissen';
    
    // Prüfe ob wir in der PWA sind (Standalone-Modus)
    const isPWACheck = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true ||
                      document.referrer.includes('android-app://');
    
    // Wenn wir uns auf der Wissens-Hauptseite befinden
    if (router.pathname === '/wissen') {
      return isPWACheck ? '/start' : '/'; // PWA → GroupView, Web → Homepage
    }
    // Wenn wir uns auf einer Wissens-Unterseite befinden, gehe zur Wissens-Hauptseite zurück
    return '/wissen';
  };

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto">
      {/* Mobile Header */}
      <div 
        className={`lg:hidden bg-gray-800 border-b border-gray-700 sticky top-0 z-40 ${
          isPWA ? 'lexikon-header-pwa' : 'py-4'
        }`}
      >
        <div className="flex items-center justify-between px-4">
          <Link href={getBackHref()} className="flex items-center text-green-400 hover:text-green-300 transition-colors">
            <ChevronLeft className="w-5 h-5 mr-1" />
            <span className="font-medium">Zurück</span>
          </Link>
          
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            aria-label="Navigation öffnen"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-black bg-opacity-75" onClick={() => setSidebarOpen(false)}>
          <div className="fixed right-0 top-0 h-full w-80 max-w-[90vw] bg-gray-800 shadow-xl border-l border-gray-700 z-[61]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Navigation</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-300" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <LexikonSidebar />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:block w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Persistent Search Bar - Always visible */}
        <div className="mb-6">
          <SearchBar />
        </div>

        {/* Breadcrumbs */}
        <div className="mb-4 sm:mb-6">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
        
        {/* Desktop: Side by side */}
        <div className="flex flex-row gap-8">
          {/* Desktop Sidebar */}
          <aside className="w-1/4 sticky top-4 self-start">
            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <LexikonSidebar />
            </div>
          </aside>
          
          {/* Main content */}
          <main className="w-3/4">
            <article className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700 overflow-y-auto">
              <div className="prose prose-lg max-w-none">
                {children}
              </div>
            </article>
          </main>
        </div>
      </div>

      {/* Mobile Layout - Full Width Content */}
      <div className="lg:hidden w-full px-4 sm:px-6 py-4 sm:py-6">
        {/* Mobile Persistent Search Bar - Always visible */}
        <div className="mb-4">
          <SearchBar />
        </div>

        {/* Mobile Breadcrumbs */}
        <div className="mb-4">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
        
        {/* Mobile Main content - Full width */}
        <main className="w-full">
          <article className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700 overflow-y-auto">
            <div className="prose prose-sm sm:prose-base max-w-none">
              {children}
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}; 