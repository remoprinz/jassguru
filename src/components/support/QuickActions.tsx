import React from 'react';
import { Star, ArrowRight } from 'lucide-react';
import { getCategoryIcon, getCategoryColor } from '@/utils/supportUtils';
import type { SupportArticle } from '@/types/support';

interface QuickActionsProps {
  articles: SupportArticle[];
  onSelectArticle: (article: SupportArticle) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ articles, onSelectArticle }) => {
  if (articles.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Star className="text-yellow-500 fill-yellow-500" size={20} />
        Häufige Fragen
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {articles.map((article) => {
          const Icon = getCategoryIcon(article.category.mainId);
          const colorClass = getCategoryColor(article.category.mainId);

          return (
            <button
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="group flex items-center p-3 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl transition-all hover:shadow-md text-left"
            >
              <div className={`p-2 rounded-lg mr-3 shrink-0 ${colorClass}`}>
                <Icon size={18} />
              </div>
              <span className="flex-1 text-sm font-medium text-gray-200 group-hover:text-white line-clamp-2">
                {article.title}
              </span>
              <ArrowRight size={16} className="text-gray-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all ml-2 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

