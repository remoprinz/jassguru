import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { toSlug } from '@/lib/utils';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';

interface RelatedTopicsProps {
  currentArticleId: string;
  currentCategory: string;
  currentKeywords: string[];
  maxResults?: number;
}

interface RelatedArticle {
  id: string;
  title: string;
  category: string;
  url: string;
  relevanceScore: number;
}

export const RelatedTopics: React.FC<RelatedTopicsProps> = ({
  currentArticleId,
  currentCategory,
  currentKeywords,
  maxResults = 4
}) => {
  // Finde verwandte Artikel
  const findRelatedArticles = (): RelatedArticle[] => {
    const content: JassContentRecord = allContent;
    const items = Object.values(content) as JassContentItem[];
    
    const relatedArticles: RelatedArticle[] = items
      .filter(item => item.id !== currentArticleId) // Nicht den aktuellen Artikel
      .map(item => {
        let relevanceScore = 0;
        
        // Gleiche Hauptkategorie = hohe Relevanz
        if (item.metadata.category.main === currentCategory) {
          relevanceScore += 50;
        }
        
        // Gemeinsame Keywords = mittlere Relevanz
        const commonKeywords = item.metadata.keywords.filter(keyword =>
          currentKeywords.includes(keyword)
        );
        relevanceScore += commonKeywords.length * 10;
        
        // Mindestens eine gewisse Relevanz erforderlich
        if (relevanceScore === 0) return null;
        
        const categorySlug = toSlug(item.metadata.category.main);
        const subcategorySlug = toSlug(item.metadata.category.sub);
        const topicSlug = toSlug(item.metadata.category.topic);
        const url = `/wissen/${categorySlug}/${subcategorySlug}/${topicSlug}`;
        
        return {
          id: item.id,
          title: item.metadata.category.topic,
          category: item.metadata.category.main,
          url,
          relevanceScore
        };
      })
      .filter((article): article is RelatedArticle => article !== null)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
    
    return relatedArticles;
  };

  const relatedArticles = findRelatedArticles();

  // Zeige nichts an, wenn keine verwandten Artikel gefunden wurden
  if (relatedArticles.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 pt-8 border-t border-gray-600">
      <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6">
        Das könnte dich auch interessieren
      </h3>
      
      <div className="grid gap-4 sm:grid-cols-2">
        {relatedArticles.map((article) => (
          <Link
            key={article.id}
            href={article.url}
            className="group block"
          >
            <div className="bg-gray-800 border border-gray-700 rounded-lg hover:border-green-500 hover:shadow-lg transition-all duration-300 p-5 h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-green-400 mb-2 font-medium">
                    {article.category}
                  </div>
                  <h4 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors mb-2 line-clamp-2">
                    {article.title}
                  </h4>
                  <div className="flex items-center text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                    <span>Mehr erfahren</span>
                    <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

