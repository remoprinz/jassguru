import React from 'react';
import { ChevronRight, Star, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupportArticle } from '@/types/support';
import { getCategoryIcon, getCategoryColor } from '@/utils/supportUtils';

interface ArticleListProps {
  articles: SupportArticle[];
  onSelectArticle: (article: SupportArticle) => void;
  query: string;
}

export const ArticleList: React.FC<ArticleListProps> = ({ articles, onSelectArticle, query }) => {
  if (articles.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-800 border-dashed">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mb-4 text-gray-500">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">Keine Ergebnisse gefunden</h3>
        <p className="text-gray-400 max-w-md mx-auto">
          Wir konnten keine Artikel für "{query}" finden. Versuche es mit anderen Suchbegriffen oder wähle eine Kategorie.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => {
        const Icon = getCategoryIcon(article.category.mainId);
        const colorClass = getCategoryColor(article.category.mainId);

        return (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full text-left group relative overflow-hidden bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-xl p-4 transition-all duration-200 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className={cn("p-2 rounded-lg shrink-0 mt-1", colorClass)}>
                <Icon size={20} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {article.category.main}
                  </span>
                  {article.priority === 1 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                      <Star size={8} fill="currentColor" />
                      TOP
                    </span>
                  )}
                </div>
                
                <h3 className="text-base font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors line-clamp-1">
                  {article.title}
                </h3>
                
                <p className="text-sm text-gray-400 line-clamp-2">
                  {article.description}
                </p>
              </div>

              <div className="self-center text-gray-500 group-hover:text-gray-300 group-hover:translate-x-1 transition-all">
                <ChevronRight size={20} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

