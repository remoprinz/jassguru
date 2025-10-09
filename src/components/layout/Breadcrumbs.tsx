import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  name: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  // Prüfe ob wir auf jasswiki.ch sind
  const isJassWiki = typeof window !== 'undefined' && window.location.hostname.includes('jasswiki.ch');
  
  return (
    <nav className="flex mb-4" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-3">
        {!isJassWiki && (
          <li className="inline-flex items-center">
            <Link href="/" legacyBehavior>
              <a className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-green-400 transition-colors">
                Home
              </a>
            </Link>
          </li>
        )}
        {items.map((item, index) => (
          <li key={item.href}>
            <div className="flex items-center">
              {(!isJassWiki || index > 0) && <ChevronRight className="h-4 w-4 text-gray-500" />}
              <Link href={item.href} legacyBehavior>
                <a className={`${(!isJassWiki || index > 0) ? 'ml-1' : ''} text-sm font-medium transition-colors ${index === items.length - 1 ? 'text-gray-300' : 'text-gray-400 hover:text-green-400'}`}>
                  {item.name}
                </a>
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}; 