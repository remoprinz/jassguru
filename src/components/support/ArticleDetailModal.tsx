import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, HelpCircle, Lightbulb, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { SupportArticle } from '@/types/support';
import { getCategoryIcon, getCategoryColor, getImageUrl } from '@/utils/supportUtils';
import { trackSupportArticleView, trackSupportHelpful } from '@/utils/analytics';

interface ArticleDetailModalProps {
  article: SupportArticle | null;
  isOpen: boolean;
  onClose: () => void;
  allArticles: SupportArticle[];
  onSelectArticle: (article: SupportArticle) => void;
}

export const ArticleDetailModal: React.FC<ArticleDetailModalProps> = ({ 
  article, 
  isOpen, 
  onClose,
  allArticles,
  onSelectArticle
}) => {
  const [helpfulState, setHelpfulState] = useState<'idle' | 'yes' | 'no'>('idle');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && article) {
      trackSupportArticleView(article.id, article.title);
      setHelpfulState('idle');
      // Scroll nach oben beim Öffnen oder Wechsel des Artikels
      // Kleiner Delay, damit der DOM gerendert ist bevor wir scrollen
      const scrollTimer = setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
      return () => clearTimeout(scrollTimer);
    }
  }, [isOpen, article?.id]); // Reagiere auf article.id statt article-Objekt

  if (!article) return null;

  const Icon = getCategoryIcon(article.category.mainId);
  const categoryColor = getCategoryColor(article.category.mainId);

  const handleHelpful = (isHelpful: boolean) => {
    setHelpfulState(isHelpful ? 'yes' : 'no');
    trackSupportHelpful(article.id, isHelpful);
  };

  const relatedArticles = article.seeAlso
    .map(id => allArticles.find(a => a.id === id))
    .filter((a): a is SupportArticle => !!a);

  // Finde next suggested article
  const nextArticle = article.nextSuggested 
    ? allArticles.find(a => a.id === article.nextSuggested)
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] p-0 bg-gray-900 border-gray-800 gap-0 flex flex-col overflow-hidden">
        
        {/* Header */}
        <DialogHeader className="p-6 pb-4 bg-gray-800/50 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-1.5 rounded-md", categoryColor)}>
              <Icon size={16} />
            </div>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {article.category.main}
            </span>
          </div>
          <DialogTitle className="text-2xl text-white">{article.title}</DialogTitle>
          <DialogDescription className="text-gray-400 mt-2">
            {article.description}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Steps */}
          {article.steps && article.steps.length > 0 ? (
            <div className="space-y-8">
              {article.steps.map((step) => (
                <div key={step.number} className="relative pl-8">
                  {/* Step Number Line */}
                  <div className="absolute left-2 top-8 bottom-[-32px] w-px bg-gray-800 last:hidden" />
                  
                  {/* Step Badge */}
                  <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                    {step.number}
                  </div>
                  
                  {/* Content */}
                  <div>
                    <p className="text-gray-200 text-base font-medium mb-3 leading-relaxed">
                      {step.text}
                    </p>
                    
                    {step.image && (
                      <div className="my-4 rounded-xl overflow-hidden border border-gray-800 bg-black/20">
                        <div className="relative aspect-[9/16] w-full max-w-sm mx-auto">
                           <Image 
                             src={getImageUrl(step.image)}
                             alt={`Schritt ${step.number}`}
                             fill
                             className="object-contain"
                             sizes="(max-width: 768px) 100vw, 400px"
                           />
                        </div>
                      </div>
                    )}
                    
                    {step.tip && (
                      <div className="mt-3 flex gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                        <Lightbulb size={16} className="shrink-0 mt-0.5 text-blue-400" />
                        <span>{step.tip}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Fallback to description if no steps */
            <div className="prose prose-invert max-w-none">
               <ReactMarkdown remarkPlugins={[remarkGfm]}>
                 {article.description}
               </ReactMarkdown>
            </div>
          )}

          {/* Tips Section */}
          {article.tips && article.tips.length > 0 && (
            <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-5">
              <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Lightbulb size={16} />
                Gut zu wissen
              </h3>
              <ul className="space-y-2">
                {article.tips.map((tip, i) => (
                  <li key={i} className="text-gray-300 text-sm flex gap-2">
                    <span className="text-yellow-500 mt-1.5 text-[8px]">●</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* FAQ Section */}
          {article.faq && article.faq.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <HelpCircle size={20} className="text-blue-400" />
                Häufige Fragen
              </h3>
              <div className="grid gap-3">
                {article.faq.map((faq, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-200 mb-2">{faq.question}</h4>
                    <p className="text-sm text-gray-400">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Suggested */}
          {nextArticle && (
            <div className="bg-gradient-to-r from-gray-800 to-gray-800/50 rounded-xl p-5 border border-gray-700">
               <p className="text-sm text-gray-400 mb-3">
                 {article.nextSuggestedText || "Nächster empfohlener Schritt:"}
               </p>
               <button 
                 onClick={() => {
                   onSelectArticle(nextArticle);
                   // Scroll wird automatisch durch useEffect ausgelöst
                 }}
                 className="flex items-center gap-3 w-full group"
               >
                 <div className={cn("p-2 rounded-lg shrink-0", getCategoryColor(nextArticle.category.mainId))}>
                   {React.createElement(getCategoryIcon(nextArticle.category.mainId), { size: 20 })}
                 </div>
                 <span className="text-base font-medium text-white group-hover:text-blue-400 transition-colors">
                   {nextArticle.title}
                 </span>
                 <ArrowRight size={18} className="ml-auto text-gray-500 group-hover:translate-x-1 transition-transform" />
               </button>
            </div>
          )}

          {/* Feedback */}
          <div className="py-6 border-t border-gray-800">
            <h4 className="text-center text-sm font-medium text-gray-400 mb-4">
              War dieser Artikel hilfreich?
            </h4>
            <div className="flex justify-center gap-4">
              <Button
                size="sm"
                onClick={() => handleHelpful(true)}
                className={cn(
                  "gap-2 min-w-[100px] text-white font-bold rounded-xl shadow-lg border-b-4 transition-all",
                  helpfulState === 'yes' 
                    ? "bg-green-600 hover:bg-green-700 border-green-900" 
                    : "bg-gray-700 hover:bg-gray-600 border-gray-900"
                )}
                disabled={helpfulState !== 'idle'}
              >
                <ThumbsUp size={16} />
                Ja
              </Button>
              <Button
                size="sm"
                onClick={() => handleHelpful(false)}
                className={cn(
                  "gap-2 min-w-[100px] text-white font-bold rounded-xl shadow-lg border-b-4 transition-all",
                  helpfulState === 'no' 
                    ? "bg-red-600 hover:bg-red-700 border-red-900" 
                    : "bg-gray-700 hover:bg-gray-600 border-gray-900"
                )}
                disabled={helpfulState !== 'idle'}
              >
                <ThumbsDown size={16} />
                Nein
              </Button>
            </div>
            {helpfulState !== 'idle' && (
              <p className="text-center text-xs text-green-400 mt-3 animate-fade-in">
                Danke für dein Feedback!
              </p>
            )}
          </div>

          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <div className="pb-8">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Auch interessant
              </h4>
              <div className="grid gap-2">
                {relatedArticles.map(related => (
                  <button
                    key={related.id}
                    onClick={() => {
                      onSelectArticle(related);
                      // Scroll wird automatisch durch useEffect ausgelöst
                    }}
                    className="text-left text-sm text-blue-400 hover:text-blue-300 hover:underline py-1"
                  >
                    {related.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-800 bg-gray-900 shrink-0">
          <Button 
            onClick={onClose}
            className="w-full h-12 text-white font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 transition-all"
          >
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

