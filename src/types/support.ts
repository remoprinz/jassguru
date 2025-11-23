export interface SupportCategory {
  main: string;
  mainId: string;
  number: number;
}

export interface SupportStep {
  number: number;
  text: string;
  image?: string;
  tip?: string;
}

export interface SupportFAQ {
  question: string;
  answer: string;
}

export interface SupportArticle {
  id: string;
  number: string;
  title: string;
  category: SupportCategory;
  difficulty: 'einfach' | 'mittel' | 'schwer';
  priority: number;
  tags: string[];
  description: string;
  steps: SupportStep[];
  images: string[];
  primaryImage?: string;
  keywords: string[];
  synonyms: string[];
  userProblems: string[];
  nextSuggested?: string;
  nextSuggestedText?: string;
  seeAlso: string[];
  faq: SupportFAQ[];
  tips: string[];
}

export type SupportContent = Record<string, SupportArticle>;

