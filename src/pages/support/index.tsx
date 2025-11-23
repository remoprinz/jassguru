import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Info } from 'lucide-react';

import MainLayout from '@/components/layout/MainLayout';
import { SupportSearchBar } from '@/components/support/SupportSearchBar';
import { CategoryGrid } from '@/components/support/CategoryGrid';
import { QuickActions } from '@/components/support/QuickActions';
import { ArticleList } from '@/components/support/ArticleList';
import { ArticleDetailModal } from '@/components/support/ArticleDetailModal';

import { useSupportSearch } from '@/hooks/useSupportSearch';
import { getUniqueCategories, getQuickActions } from '@/utils/supportUtils';
import { trackSupportSearch, trackSupportCategoryFilter } from '@/utils/analytics';
import type { SupportArticle } from '@/types/support';

// Import JSON data
import supportDataRaw from '@/data/support-content.json';

// Convert object to array once
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

  // Computed Data
  const categories = useMemo(() => getUniqueCategories(ALL_ARTICLES), []);
  const quickActions = useMemo(() => getQuickActions(ALL_ARTICLES), []);

  // Modal State via URL
  const selectedArticleId = router.query.article as string | undefined;
  const selectedArticle = selectedArticleId 
    ? ALL_ARTICLES.find(a => a.id === selectedArticleId) || null
    : null;

  // Handlers
  const handleSelectArticle = (article: SupportArticle) => {
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, article: article.id },
      },
      undefined,
      { shallow: true }
    );
  };

  const handleCloseModal = () => {
    const newQuery = { ...router.query };
    delete newQuery.article;
    
    router.push(
      {
        pathname: router.pathname,
        query: newQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    if (categoryId) {
      trackSupportCategoryFilter(categoryId);
    }
  };

  // Track Search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        trackSupportSearch(query, filteredArticles.length);
      }
    }, 1000); // Track erst nach 1s typing pause

    return () => clearTimeout(timeoutId);
  }, [query, filteredArticles.length]);

  return (
    <MainLayout>
      <Head>
        <title>Hilfe & Support | Jasstafel</title>
        <meta name="description" content="Hilfe, Anleitungen und Support für die Jasstafel App." />
      </Head>

      <div className="min-h-screen bg-gray-900 pb-24">
        <div className="max-w-3xl mx-auto px-4 py-8">
          
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-3">
              Wie können wir helfen?
            </h1>
            <p className="text-gray-400 max-w-lg mx-auto">
              Durchsuche unsere Anleitungen, Tipps und Antworten auf häufige Fragen.
            </p>
          </div>

          {/* Search */}
          <SupportSearchBar query={query} setQuery={setQuery} />

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
            /* Filter View */
            <>
              <CategoryGrid 
                categories={categories} 
                selectedCategory={selectedCategory} 
                onSelectCategory={handleCategorySelect} 
              />
              
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {filteredArticles.length} {filteredArticles.length === 1 ? 'Ergebnis' : 'Ergebnisse'}
                </h2>
                {selectedCategory && (
                   <button 
                     onClick={() => setSelectedCategory(null)}
                     className="text-sm text-blue-400 hover:text-blue-300"
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

          {/* Support Footer */}
          {!query && !selectedCategory && (
            <div className="mt-12 text-center p-6 bg-gray-800/30 rounded-2xl border border-gray-800">
              <Info className="mx-auto text-gray-500 mb-3" size={24} />
              <p className="text-gray-400 text-sm mb-4">
                Nicht gefunden was du suchst?
              </p>
              <a 
                href="mailto:info@jassguru.ch"
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 text-white font-bold rounded-xl shadow-lg transition-all"
              >
                Kontakt aufnehmen
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <ArticleDetailModal 
        article={selectedArticle}
        isOpen={!!selectedArticle}
        onClose={handleCloseModal}
        allArticles={ALL_ARTICLES}
        onSelectArticle={handleSelectArticle}
      />
    </MainLayout>
  );
}

