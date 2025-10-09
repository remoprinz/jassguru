import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { toSlug } from '@/lib/utils';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';

interface SearchResult {
  id: string;
  title: string;
  category: string;
  url: string;
  snippet: string;
}

export const SearchBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Schließe Dropdown bei Klick außerhalb
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Suche durchführen
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const searchQuery = query.toLowerCase();
    const content: JassContentRecord = allContent;
    const items = Object.values(content) as JassContentItem[];
    
    const searchResults: SearchResult[] = items
      .map((item) => {
        const title = item.metadata.category.topic.toLowerCase();
        const category = item.metadata.category.main.toLowerCase();
        const keywords = item.metadata.keywords.join(' ').toLowerCase();
        const text = item.text.toLowerCase();
        
        // Score-basierte Suche
        let score = 0;
        
        // Exakter Match im Titel = höchste Priorität
        if (title === searchQuery) score += 100;
        // Titel enthält Query
        else if (title.includes(searchQuery)) score += 50;
        // Kategorie enthält Query
        if (category.includes(searchQuery)) score += 20;
        // Keywords enthalten Query
        if (keywords.includes(searchQuery)) score += 10;
        // Text enthält Query
        if (text.includes(searchQuery)) score += 5;
        
        if (score === 0) return null;
        
        // Erstelle URL (3 Ebenen)
        const categorySlug = toSlug(item.metadata.category.main);
        const subcategorySlug = toSlug(item.metadata.category.sub);
        const topicSlug = toSlug(item.metadata.category.topic);
        const url = `/wissen/${categorySlug}/${subcategorySlug}/${topicSlug}`;
        
        // Erstelle Snippet
        const textSnippet = item.text.substring(0, 150).replace(/\n/g, ' ');
        
        return {
          id: item.id,
          title: item.metadata.category.topic,
          category: item.metadata.category.main,
          url,
          snippet: textSnippet,
          score
        };
      })
      .filter((result): result is SearchResult & { score: number } => result !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Maximal 10 Ergebnisse
      .map(({ score, ...result }) => result); // Entferne score aus finalen Ergebnissen
    
    setResults(searchResults);
    setIsOpen(searchResults.length > 0);
  }, [query]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl mx-auto">
      {/* Suchfeld */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Suche nach Begriffen, Regeln, Varianten..."
          className="w-full pl-8 pr-4 py-4 bg-gray-800 text-white rounded-xl border border-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-base sm:text-lg"
        />
      </div>

      {/* Ergebnisse Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-h-96 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs text-gray-400 px-3 py-2 font-medium">
              {results.length} {results.length === 1 ? 'Ergebnis' : 'Ergebnisse'}
            </div>
            {results.map((result) => (
              <Link
                key={result.id}
                href={result.url}
                onClick={() => {
                  setIsOpen(false);
                  setQuery('');
                }}
                className="block px-3 py-3 hover:bg-gray-700 rounded-lg transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white group-hover:text-green-400 transition-colors mb-1">
                      {result.title}
                    </div>
                    <div className="text-xs text-green-400 mb-1">
                      {result.category}
                    </div>
                    <div className="text-sm text-gray-400 line-clamp-2">
                      {result.snippet}...
                    </div>
                  </div>
                  <Search className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Keine Ergebnisse */}
      {isOpen && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 text-center">
          <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-300 font-medium mb-1">Keine Ergebnisse gefunden</p>
          <p className="text-sm text-gray-500">
            Versuche es mit anderen Begriffen oder durchsuche die Kategorien
          </p>
        </div>
      )}
    </div>
  );
};

