import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SupportSearchBarProps {
  query: string;
  setQuery: (query: string) => void;
}

export const SupportSearchBar: React.FC<SupportSearchBarProps> = ({ query, setQuery }) => {
  return (
    <div className="relative w-full max-w-xl mx-auto mb-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <Input
          type="text"
            placeholder="Stelle deine Frage..."
          value={query}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 pr-10 py-6 text-lg bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:ring-green-500 focus:border-green-500 rounded-xl shadow-lg"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setQuery('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

