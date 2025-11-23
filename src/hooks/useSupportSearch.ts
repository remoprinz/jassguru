import { useMemo, useState, useEffect } from 'react';
import Fuse from 'fuse.js';
import type { SupportArticle } from '@/types/support';

export const useSupportSearch = (articles: SupportArticle[]) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Reset Category wenn gesucht wird (Side Effect muss in useEffect oder Handler sein)
  useEffect(() => {
    if (query.trim() && selectedCategory) {
      setSelectedCategory(null);
    }
  }, [query]);

  // Fuse Instanz erstellen
  const fuse = useMemo(() => {
    return new Fuse(articles, {
      keys: [
        { name: 'userProblems', weight: 4 }, // Höchste Prio: Wenn die Frage schon bekannt ist
        { name: 'keywords', weight: 3 },     // Keywords sind sehr spezifisch
        { name: 'synonyms', weight: 3 },     // Synonyme ebenso
        { name: 'title', weight: 2 },        // Titel ist wichtig
        { name: 'tags', weight: 2 },
        { name: 'description', weight: 1 },
        { name: 'steps.text', weight: 0.2 }  // Text ist "Noise", daher weniger Gewicht
      ],
      threshold: 0.4, // Etwas toleranter, da wir den Input säubern
      ignoreLocation: true,
      useExtendedSearch: true, // Ermöglicht komplexere Suchen
      ignoreFieldNorm: true,   // Ignoriere Feldlänge (wichtig für kurze Titel vs lange Texte)
    });
  }, [articles]);

  const filteredArticles = useMemo(() => {
    let results = articles;

    // 1. Suche
    if (query.trim()) {
      // Stop-Words entfernen für präzisere Suche
      const cleanQuery = query
        .toLowerCase()
        .replace(/\b(wie|wo|wann|warum|was|wer|ich|du|er|sie|es|wir|ihr|sie|ist|sind|war|waren|kann|können|muss|müssen|soll|sollen|der|die|das|ein|eine|einer|eines|und|oder|aber|zu|auf|in|im|mit|von|für|an|bei)\b/g, ' ') // Space statt empty string
        .replace(/\s+/g, ' ') // Doppelte Leerzeichen entfernen
        .trim();

      // Wenn nach Stop-Word-Removal nichts mehr übrig ist (z.B. "wie geht das"), nutze Original-Query
      const finalQuery = cleanQuery || query;
      
      const searchResults = fuse.search(finalQuery);
      results = searchResults.map(result => result.item);
    }

    // 2. Kategorie Filter
    // Nur filtern wenn NICHT gesucht wird (oder wenn wir Suche + Kategorie erlauben wollen, aber UX-Anforderung war Reset)
    // Da wir oben resetten, ist selectedCategory hier null wenn gesucht wird.
    // Aber falls der Reset einen Render-Cycle später passiert, sicherheitshalber checken:
    if (selectedCategory && !query.trim()) {
      results = results.filter(a => a.category.mainId === selectedCategory);
    }

    // 3. Sortierung (wenn keine Suche aktiv ist)
    // Wenn gesucht wird, vertrauen wir dem Ranking von Fuse
    if (!query.trim()) {
        // Sortiere nach Priority (niedriger = wichtiger)
        results = [...results].sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }

    return results;
  }, [articles, query, selectedCategory, fuse]);

  return {
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    filteredArticles
  };
};
