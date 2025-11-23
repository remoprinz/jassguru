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
    <div className="grid grid-cols-3 gap-2 mb-8 w-full">
      {categories.map((category) => {
        const Icon = getCategoryIcon(category.mainId);
        const colorClass = getCategoryColor(category.mainId);
        const isSelected = selectedCategory === category.mainId;

        return (
          <button
            key={category.mainId}
            onClick={() => onSelectCategory(isSelected ? null : category.mainId)}
            className={cn(
              "w-full flex flex-col items-center justify-start p-2 rounded-lg border transition-all duration-200 min-h-[80px]",
              "hover:scale-105 active:scale-95",
              isSelected 
                ? "bg-gray-800 border-blue-500 ring-1 ring-blue-500/20" 
                : "bg-gray-800/30 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600"
            )}
          >
            <div className={cn("p-2 md:p-3 rounded-full mb-1.5", colorClass)}>
              <Icon size={18} className="md:w-6 md:h-6" />
            </div>
            <span className={cn(
              "text-[10px] md:text-sm leading-tight font-medium text-center line-clamp-2 w-full",
              isSelected ? "text-white" : "text-gray-400"
            )}>
              {category.main.replace(' & ', ' &\n')}
            </span>
          </button>
        );
      })}
    </div>
  );
};
