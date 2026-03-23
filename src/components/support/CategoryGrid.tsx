import React from 'react';
import { cn } from '@/lib/utils';
import { getCategoryIcon, getCategoryColor } from '@/utils/supportUtils';
import type { SupportCategory } from '@/types/support';

interface CategoryGridProps {
  categories: SupportCategory[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  categories,
  selectedCategory,
  onSelectCategory
}) => {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mb-10">
      {categories.map((category) => {
        const Icon = getCategoryIcon(category.mainId);
        const colorClass = getCategoryColor(category.mainId);
        const isSelected = selectedCategory === category.mainId;

        return (
          <button
            key={category.mainId}
            onClick={() => onSelectCategory(isSelected ? null : category.mainId)}
            className={cn(
              "flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border transition-all duration-200",
              "active:scale-95",
              isSelected
                ? "bg-white/[0.08] border-blue-500/40 ring-1 ring-blue-500/20"
                : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]"
            )}
          >
            <div className={cn("p-2.5 sm:p-3 rounded-xl mb-2", colorClass)}>
              <Icon size={24} />
            </div>
            <span className={cn(
              "text-xs sm:text-sm leading-tight font-medium text-center",
              isSelected ? "text-white" : "text-gray-300"
            )}>
              {category.main}
            </span>
          </button>
        );
      })}
    </div>
  );
};
