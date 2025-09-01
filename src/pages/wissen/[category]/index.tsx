import React, { useEffect } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import Link from 'next/link';
import allContent from '@/data/jass-lexikon.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';
import { toSlug } from '@/lib/utils';

// Funktion zur schönen Formatierung von Topic-Namen
const formatTopicName = (name: string): string => {
  return name
    .replace(/ACHTBLATT/g, 'Achtblatt')
    .replace(/NEUNBLATT/g, 'Neunblatt')
    .replace(/DREIBLATT/g, 'Dreiblatt')
    .replace(/VIERBLATT/g, 'Vierblatt')
    .replace(/FUENFBLATT/g, 'Fünfblatt')
    .replace(/SECHSBLATT/g, 'Sechsblatt')
    .replace(/SIEBENBLATT/g, 'Siebenblatt')
    .replace(/VIER_GLEICHE/g, 'Vier gleiche')
    .replace(/GRUNDREGELN/g, 'Grundregeln')
    .replace(/REIHENFOLGE/g, 'Reihenfolge')
    .replace(/SCHNEIDER/g, 'Schneider')
    .replace(/KORREKTUREN/g, 'Korrekturen')
    .replace(/ZAHLENDARSTELLUNG/g, 'Zahlendarstellung')
    .replace(/FRUEHZEITIGES_BEDANKEN/g, 'Frühzeitiges Bedanken')
    .replace(/BEDANKEN/g, 'Bedanken')
    .replace(/STOECK/g, 'Stöck');
};

// Helper to get topics for a specific category
const getTopicsForCategory = (content: JassContentRecord, categorySlug: string): string[] => {
  const topics = new Set<string>();
  
  (Object.values(content) as JassContentItem[]).forEach(item => {
    if (toSlug(item.metadata.category.main) === categorySlug) {
      topics.add(item.metadata.category.topic);
    }
  });
  
  return Array.from(topics).sort();
};

// Helper to deslugify
const deslugify = (slug: string): string => {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

interface CategoryPageProps {
  category: string;
  categorySlug: string;
  topics: string[];
}

const CategoryPage: React.FC<CategoryPageProps> = ({ category, categorySlug, topics }) => {
  const router = useRouter();
  const breadcrumbItems = [
    { name: 'Wissen', href: '/wissen' },
    { name: category, href: `/wissen/${categorySlug}` }
  ];

  // Enable scrolling for knowledge pages
  useEffect(() => {
    // Add class to enable scrolling
    document.body.classList.add('lexikon-page');
    
    // Cleanup: Remove class when component unmounts
    return () => {
      document.body.classList.remove('lexikon-page');
    };
  }, []);

  // If router is not ready yet
  if (router.isFallback) {
    return <div>Lade...</div>;
  }

  return (
    <LexikonLayout breadcrumbItems={breadcrumbItems}>
      <div className="space-y-6 sm:space-y-8">
        {/* Category Header */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            {category}
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto">
            Wähle ein Thema aus, um mehr zu erfahren:
          </p>
        </div>
        
        {/* Topics Grid */}
        <div className="grid gap-4 sm:gap-6">
          {topics.map((topic) => (
            <Link 
              key={topic}
              href={`/wissen/${categorySlug}/${toSlug(topic)}`}
              className="group block"
            >
              <div className="bg-gray-800 border border-gray-700 rounded-xl hover:border-green-500 hover:shadow-xl transition-all duration-300 p-6 sm:p-8 hover:scale-[1.02]">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-green-400 transition-colors mb-2">
                      {formatTopicName(topic)}
                    </h3>
                    <p className="text-base sm:text-lg text-gray-300">
                      Alles über {formatTopicName(topic).toLowerCase()} im Detail
                    </p>
                  </div>
                  <div className="ml-4 text-green-400 group-hover:translate-x-1 transition-transform">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Back to Overview Link */}
        <div className="text-center pt-8 border-t border-gray-700">
          <Link 
            href="/wissen"
            className="inline-flex items-center px-6 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 hover:text-white transition-colors font-medium border border-gray-600"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück zur Übersicht
          </Link>
        </div>
      </div>
    </LexikonLayout>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const categories = new Set<string>();
  
  (Object.values(allContent) as JassContentItem[]).forEach(item => {
    categories.add(toSlug(item.metadata.category.main));
  });
  
  const paths = Array.from(categories).map(category => ({
    params: { category }
  }));
  
  return {
    paths,
    fallback: false
  };
};

export const getStaticProps: GetStaticProps<CategoryPageProps> = async ({ params }) => {
  const categorySlug = params?.category as string;
  
  // Find the actual category name from the content
  let categoryName = '';
  (Object.values(allContent) as JassContentItem[]).some(item => {
    if (toSlug(item.metadata.category.main) === categorySlug) {
      categoryName = item.metadata.category.main;
      return true;
    }
    return false;
  });
  
  if (!categoryName) {
    return { notFound: true };
  }
  
  const topics = getTopicsForCategory(allContent, categorySlug);
  
  return {
    props: {
      category: categoryName,
      categorySlug,
      topics
    }
  };
};

export default CategoryPage; 