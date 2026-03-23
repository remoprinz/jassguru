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
    <div className="mb-10">
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
              className="group flex items-center p-4 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.1] rounded-xl transition-all text-left"
            >
              <div className={`p-2.5 rounded-lg mr-3.5 shrink-0 ${colorClass}`}>
                <Icon size={20} />
              </div>
              <span className="flex-1 text-base font-medium text-gray-200 group-hover:text-white line-clamp-2">
                {article.title}
              </span>
              <ArrowRight size={18} className="text-gray-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all ml-2 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
