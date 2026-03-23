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
      <div className="text-center py-16 bg-white/[0.03] rounded-2xl border border-white/[0.06] border-dashed">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.05] mb-4 text-gray-500">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">Keine Ergebnisse gefunden</h3>
        <p className="text-gray-400 max-w-md mx-auto px-4">
          Wir konnten keine Artikel für &ldquo;{query}&rdquo; finden. Versuche es mit anderen Suchbegriffen oder wähle eine Kategorie.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
      {articles.map((article) => {
        const Icon = getCategoryIcon(article.category.mainId);
        const colorClass = getCategoryColor(article.category.mainId);

        return (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full text-left group bg-white/[0.04] backdrop-blur-sm hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.1] rounded-xl p-4 transition-all duration-200"
          >
            <div className="flex items-start gap-3.5">
              <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", colorClass)}>
                <Icon size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
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

              <div className="self-center text-gray-600 group-hover:text-gray-300 group-hover:translate-x-1 transition-all">
                <ChevronRight size={20} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
