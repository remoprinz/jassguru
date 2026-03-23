import { IconType } from 'react-icons';
import { IoMdPhonePortrait } from 'react-icons/io';
import { GiPokerHand } from 'react-icons/gi';
import { FaTrophy, FaUser } from 'react-icons/fa6';
import { RiGroupFill } from 'react-icons/ri';
import { IoSettingsSharp } from 'react-icons/io5';
import { PiShieldCheckBold, PiQuestionBold } from 'react-icons/pi';
import type { SupportArticle, SupportCategory } from '@/types/support';

export const CATEGORY_ICONS: Record<string, IconType> = {
  'pwa': IoMdPhonePortrait,
  'spiele': GiPokerHand,
  'turniere': FaTrophy,
  'gruppen': RiGroupFill,
  'statistiken': FaUser,
  'einstellungen': IoSettingsSharp,
  'troubleshooting': IoSettingsSharp,
  'datenschutz': PiShieldCheckBold,
  'default': PiQuestionBold
};

export const CATEGORY_COLORS: Record<string, string> = {
  'pwa': 'text-blue-400 bg-blue-400/10',
  'spiele': 'text-green-400 bg-green-400/10',
  'turniere': 'text-yellow-400 bg-yellow-400/10',
  'gruppen': 'text-purple-400 bg-purple-400/10',
  'statistiken': 'text-pink-400 bg-pink-400/10',
  'einstellungen': 'text-gray-400 bg-gray-400/10',
  'troubleshooting': 'text-red-400 bg-red-400/10',
  'datenschutz': 'text-indigo-400 bg-indigo-400/10',
  'default': 'text-gray-400 bg-gray-400/10'
};

export const getCategoryIcon = (categoryId: string): IconType => {
  return CATEGORY_ICONS[categoryId] || CATEGORY_ICONS['default'];
};

export const getCategoryColor = (categoryId: string): string => {
  return CATEGORY_COLORS[categoryId] || CATEGORY_COLORS['default'];
};

export const getImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  // Bilder wurden von .webp auf .png migriert
  const pngPath = path.replace(/\.webp$/, '.png');
  return `/support-images/${pngPath}`;
};

export const getUniqueCategories = (articles: SupportArticle[]): SupportCategory[] => {
  const categoriesMap = new Map<string, SupportCategory>();

  articles.forEach(article => {
    if (!categoriesMap.has(article.category.mainId)) {
      categoriesMap.set(article.category.mainId, article.category);
    }
  });

  return Array.from(categoriesMap.values()).sort((a, b) => a.number - b.number);
};

export const getQuickActions = (articles: SupportArticle[], limit = 6): SupportArticle[] => {
  return [...articles]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
};
