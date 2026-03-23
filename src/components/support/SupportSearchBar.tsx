import React from 'react';
import { PiMagnifyingGlassBold } from 'react-icons/pi';
import { X } from 'lucide-react';

interface SupportSearchBarProps {
  query: string;
  setQuery: (query: string) => void;
}

export const SupportSearchBar: React.FC<SupportSearchBarProps> = ({ query, setQuery }) => {
  return (
    <div className="relative flex items-center">
      <div className="absolute left-3.5 z-10 flex items-center justify-center text-gray-500 pointer-events-none">
        <PiMagnifyingGlassBold style={{ width: 20, height: 20 }} />
      </div>
      <input
        type="text"
        placeholder="Stelle deine Frage..."
        value={query}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full pl-11 pr-11 py-3 text-base bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 rounded-xl transition-all"
      />
      {query && (
        <button
          className="absolute right-3 h-7 w-7 flex items-center justify-center text-gray-400 hover:text-white rounded-md transition-colors"
          onClick={() => setQuery('')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
