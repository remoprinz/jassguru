import React, { useEffect, useMemo } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import { SeoHead } from '@/components/layout/SeoHead';
import Link from 'next/link';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';
import { toSlug } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

// Helper: Holt alle Artikel einer Unterkategorie
function getArticlesForSubcategory(
  content: JassContentRecord,
  categorySlug: string,
  subcategorySlug: string
): JassContentItem[] {
  return (Object.values(content) as JassContentItem[])
    .filter(item => 
      toSlug(item.metadata.category.main) === categorySlug &&
      toSlug(item.metadata.category.sub) === subcategorySlug
    )
    .sort((a, b) => {
      // Sortiere alphabetisch (nicht nach Wichtigkeit)
      return a.metadata.category.topic.localeCompare(b.metadata.category.topic, 'de');
    });
}

interface SubcategoryPageProps {
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  articles: JassContentItem[];
}

const SubcategoryPage: React.FC<SubcategoryPageProps> = ({
  category,
  categorySlug,
  subcategory,
  subcategorySlug,
  articles = []
}) => {
  const router = useRouter();
  
  const breadcrumbItems = [
    { name: 'Jass-Wiki', href: '/wissen' },
    { name: category, href: `/wissen/${categorySlug}` },
    { name: subcategory, href: `/wissen/${categorySlug}/${subcategorySlug}` }
  ];

  // 🔥 KRITISCH: sortedArticles MUSS VOR den useEffects definiert werden
  // useMemo verhindert unnötige Neu-Berechnungen
  const sortedArticles = useMemo(() => {
    if (!articles || articles.length === 0) return [];
    
    const sorted = [...articles];
    
    // Spezielle Sortierung für Weis-Regeln
    if (categorySlug === 'weis-regeln' && subcategorySlug === 'weis-arten') {
      sorted.sort((a, b) => {
        const getWeisOrderIndex = (name: string) => {
          const lowerName = name.toLowerCase();
          
          // Spezielle Mappings für die verschiedenen Artikel-Titel
          if (lowerName.includes('dreiblatt') || lowerName.includes('3 blatt')) return 1;
          if (lowerName.includes('vierblatt') || lowerName.includes('4 blatt')) return 2;
          if (lowerName.includes('fünfblatt') || lowerName.includes('5 blatt')) return 3;
          if (lowerName.includes('sechsblatt') || lowerName.includes('6 blatt')) return 4;
          if (lowerName.includes('siebenblatt') || lowerName.includes('7 blatt')) return 5;
          if (lowerName.includes('achtblatt') || lowerName.includes('8 blatt')) return 6;
          if (lowerName.includes('neunblatt') || lowerName.includes('9 blatt')) return 7;
          if (lowerName.includes('vier gleiche')) return 8;
          if (lowerName.includes('stöck')) return 9;
          if (lowerName.includes('reihenfolge')) return 10;
          if (lowerName.includes('schneider')) return 11;
          if (lowerName.includes('korrekturen')) return 12;
          if (lowerName.includes('zahlendarstellung')) return 13;
          if (lowerName.includes('frühzeitiges bedanken')) return 14;
          if (lowerName.includes('bedanken')) return 15;
          if (lowerName.includes('allgemeine weis') || lowerName.includes('grundregeln')) return 0;
          if (lowerName.includes('ausmachen')) return 16;
          
          // Fallback für unbekannte Artikel
          return 999;
        };

        const indexA = getWeisOrderIndex(a.metadata.category.topic);
        const indexB = getWeisOrderIndex(b.metadata.category.topic);

        // Sortiere nach Index
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        
        // Falls gleicher Index, alphabetisch sortieren
        return a.metadata.category.topic.localeCompare(b.metadata.category.topic);
      });
    }
    
    return sorted;
  }, [articles, categorySlug, subcategorySlug]);

  // 🛡️ ROBUST: SMART REDIRECT mit router.isReady Check
  // Wenn nur ein Artikel vorhanden ist, leite direkt dorthin weiter
  useEffect(() => {
    if (!router.isReady) return;
    
    if (sortedArticles.length === 1) {
      const article = sortedArticles[0];
      const destination = `/wissen/${categorySlug}/${subcategorySlug}/${toSlug(article.metadata.category.topic)}`;
      router.replace(destination);
    }
  }, [sortedArticles, categorySlug, subcategorySlug, router, router.isReady]);

  // Scrolling für Wissensseiten aktivieren
  useEffect(() => {
    document.body.classList.add('lexikon-page');
    return () => {
      document.body.classList.remove('lexikon-page');
    };
  }, []);

  // Loading State
  if (router.isFallback || !category || !subcategory || articles.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Lädt...</p>
        </div>
      </div>
    );
  }

  // If only one article, don't render the overview page (redirect will happen)
  if (sortedArticles.length === 1) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Wird weitergeleitet...</p>
        </div>
      </div>
    );
  }

  const pageTitle = `${subcategory} - ${category} | Jassguru.ch`;
  const pageDescription = `Alle Artikel über ${subcategory} beim Jassen. ${sortedArticles.length} ${sortedArticles.length === 1 ? 'Artikel' : 'Artikel'} mit detaillierten Erklärungen und Beispielen.`;

  return (
    <>
      <SeoHead
        title={pageTitle}
        description={pageDescription}
      />
      
      <LexikonLayout breadcrumbItems={breadcrumbItems}>
        <div className="space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              {subcategory}
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto mb-2">
              {sortedArticles.length} {sortedArticles.length === 1 ? 'Artikel' : 'Artikel'} in dieser Kategorie
            </p>
            <p className="text-base text-gray-400 max-w-xl mx-auto">
              Wähle einen Artikel aus, um mehr zu erfahren
            </p>
          </div>

          {/* Artikel-Liste */}
          <div className="grid gap-4 sm:gap-5">
            {sortedArticles.map((article) => {
              const articleSlug = toSlug(article.metadata.category.topic);
              const articleUrl = `/wissen/${categorySlug}/${subcategorySlug}/${articleSlug}`;
              
              // Extrahiere erste Zeile als Vorschau
              const preview = article.text
                .split('\n')
                .slice(0, 2)
                .join(' ')
                .substring(0, 150)
                .trim();

              return (
                <Link
                  key={article.id}
                  href={articleUrl}
                  className="group block"
                >
                  <div className="bg-gray-800 border border-gray-700 rounded-xl hover:border-green-500 hover:shadow-xl transition-all duration-300 p-5 sm:p-6 hover:scale-[1.01]">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Titel */}
                        <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-green-400 transition-colors mb-2">
                          {article.metadata.category.topic}
                        </h3>
                        
                        {/* Vorschau */}
                        <p className="text-base text-gray-300 line-clamp-2">
                          {preview}...
                        </p>
                      </div>
                      
                      {/* Arrow */}
                      <div className="flex-shrink-0 text-green-400 group-hover:translate-x-1 transition-transform">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Zurück zur Kategorie */}
          <div className="text-center pt-8 border-t border-gray-700">
            <Link
              href={`/wissen/${categorySlug}`}
              className="inline-flex items-center px-6 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 hover:text-white transition-colors font-medium border border-gray-600"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zurück zu {category}
            </Link>
          </div>
        </div>
      </LexikonLayout>
    </>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const content: JassContentRecord = allContent;
  const items = Object.values(content) as JassContentItem[];
  
  // Sammle alle einzigartigen Kategorie/Unterkategorie Kombinationen
  const combinations = new Set<string>();
  items.forEach(item => {
    const catSlug = toSlug(item.metadata.category.main);
    const subSlug = toSlug(item.metadata.category.sub);
    combinations.add(`${catSlug}/${subSlug}`);
  });
  
  const paths = Array.from(combinations).map(combo => {
    const [category, subcategory] = combo.split('/');
    return {
      params: { category, subcategory }
    };
  });
  
  return {
    paths,
    fallback: false
  };
};

export const getStaticProps: GetStaticProps<SubcategoryPageProps> = async ({ params }) => {
  const categorySlug = params?.category as string;
  const subcategorySlug = params?.subcategory as string;
  
  const content: JassContentRecord = allContent;
  const articles = getArticlesForSubcategory(content, categorySlug, subcategorySlug);
  
  if (articles.length === 0) {
    return { notFound: true };
  }
  
  // Finde die tatsächlichen Namen (nicht Slugs)
  const firstArticle = articles[0];
  const category = firstArticle.metadata.category.main;
  const subcategory = firstArticle.metadata.category.sub;
  
  return {
    props: {
      category,
      categorySlug,
      subcategory,
      subcategorySlug,
      articles: articles.map(article => ({
        id: article.id,
        text: article.text.substring(0, 200), // Nur Vorschau für Performance
        metadata: article.metadata
      }))
    }
  };
};

export default SubcategoryPage;