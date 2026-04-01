import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

import SupportLayout from '@/components/support/SupportLayout';
import { SupportSearchBar } from '@/components/support/SupportSearchBar';
import { CategoryGrid } from '@/components/support/CategoryGrid';
import { QuickActions } from '@/components/support/QuickActions';
import { ArticleList } from '@/components/support/ArticleList';

import { useSupportSearch } from '@/hooks/useSupportSearch';
import { getUniqueCategories, getQuickActions } from '@/utils/supportUtils';
import { trackSupportSearch, trackSupportCategoryFilter } from '@/utils/analytics';
import type { SupportArticle } from '@/types/support';

import supportDataRaw from '@/data/support-content.json';

const ALL_ARTICLES = Object.values(supportDataRaw) as SupportArticle[];

export default function SupportPage() {
  const router = useRouter();
  const {
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    filteredArticles
  } = useSupportSearch(ALL_ARTICLES);

  // Sync URL query param → search state (for navigation from article page)
  useEffect(() => {
    const urlQuery = router.query.q as string | undefined;
    if (urlQuery && !query) {
      setQuery(urlQuery);
    }
  }, [router.query.q]);

  const categories = useMemo(() => getUniqueCategories(ALL_ARTICLES), []);
  const quickActions = useMemo(() => getQuickActions(ALL_ARTICLES), []);

  const handleSelectArticle = (article: SupportArticle) => {
    router.push(`/support/${article.id}`);
  };

  const resultsRef = useRef<HTMLDivElement>(null);

  const handleCategorySelect = (categoryId: string | null) => {
    setQuery('');
    setSelectedCategory(categoryId);
    if (categoryId) {
      trackSupportCategoryFilter(categoryId);
    }
  };

  // Auto-scroll zu Ergebnissen bei Kategorie-Auswahl
  useEffect(() => {
    if (selectedCategory && resultsRef.current) {
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [selectedCategory]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        trackSupportSearch(query, filteredArticles.length);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [query, filteredArticles.length]);

  return (
    <SupportLayout
      headerSearch={<SupportSearchBar query={query} setQuery={setQuery} />}
    >
      <Head>
        <title>Hilfe & Support | JassGuru</title>
        <meta name="description" content="Hilfe, Anleitungen und Support für die JassGuru App — die digitale Jass-Kreidetafel der Schweiz." />
      </Head>

      {/* Hero (compact, search is in header now) */}
      <div className="text-center pt-10 pb-6 sm:pt-14 sm:pb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
          Was möchtest du wissen?
        </h1>
        <p className="text-base text-gray-300 max-w-lg mx-auto">
          Durchsuche unsere Anleitungen, Tipps und Antworten auf häufige Fragen.
        </p>
      </div>

      {/* Main Content */}
      {!query.trim() && !selectedCategory ? (
        <>
          <CategoryGrid
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
          />
          <QuickActions
            articles={quickActions}
            onSelectArticle={handleSelectArticle}
          />
        </>
      ) : (
        <>
          <CategoryGrid
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
          />

          <div ref={resultsRef} className="mb-4 flex items-center justify-between scroll-mt-20">
            <h2 className="text-lg font-semibold text-white">
              {filteredArticles.length} {filteredArticles.length === 1 ? 'Ergebnis' : 'Ergebnisse'}
            </h2>
            {(selectedCategory || query.trim()) && (
              <button
                onClick={() => {
                  setQuery('');
                  setSelectedCategory(null);
                }}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>

          <ArticleList
            articles={filteredArticles}
            onSelectArticle={handleSelectArticle}
            query={query}
          />
        </>
      )}

      {/* Dezenter Kontakt-Footer */}
      {!query && !selectedCategory && (
        <div className="mt-16 mb-8 text-center py-6 border-t border-white/[0.06]">
          <p className="text-sm text-gray-500 mb-1">
            Nicht gefunden was du suchst?
          </p>
          <Link
            href="mailto:info@jassverband.ch"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Schreib uns an info@jassverband.ch
          </Link>
        </div>
      )}
    </SupportLayout>
  );
}
