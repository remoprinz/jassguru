import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

import SupportLayout from '@/components/support/SupportLayout';
import { SupportSearchBar } from '@/components/support/SupportSearchBar';
import { getCategoryIcon, getCategoryColor, getImageUrl } from '@/utils/supportUtils';
import { trackSupportArticleView, trackSupportHelpful } from '@/utils/analytics';
import type { SupportArticle } from '@/types/support';

import supportDataRaw from '@/data/support-content.json';

const ALL_ARTICLES = Object.values(supportDataRaw) as SupportArticle[];

export default function ArticlePage() {
  const router = useRouter();
  const { articleId } = router.query;
  const [helpfulState, setHelpfulState] = useState<'idle' | 'yes' | 'no'>('idle');
  const [searchQuery, setSearchQuery] = useState('');

  const article = articleId
    ? ALL_ARTICLES.find(a => a.id === articleId) || null
    : null;

  // Navigate to search results when user types in header search
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(() => {
      router.push(`/support/?q=${encodeURIComponent(searchQuery)}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (article) {
      trackSupportArticleView(article.id, article.title);
      setHelpfulState('idle');
      window.scrollTo({ top: 0 });
    }
  }, [article?.id]);

  if (!article) {
    return (
      <SupportLayout
        headerSearch={<SupportSearchBar query={searchQuery} setQuery={setSearchQuery} />}
      >
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-gray-400 mb-4">
              {router.isFallback ? 'Laden...' : 'Artikel nicht gefunden.'}
            </p>
            <Link
              href="/support"
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              Zurück zum Support
            </Link>
          </div>
        </div>
      </SupportLayout>
    );
  }

  const Icon = getCategoryIcon(article.category.mainId);
  const categoryColor = getCategoryColor(article.category.mainId);

  const handleHelpful = (isHelpful: boolean) => {
    setHelpfulState(isHelpful ? 'yes' : 'no');
    trackSupportHelpful(article.id, isHelpful);
  };

  const relatedArticles = article.seeAlso
    .map(id => ALL_ARTICLES.find(a => a.id === id))
    .filter((a): a is SupportArticle => !!a);

  const nextArticle = article.nextSuggested
    ? ALL_ARTICLES.find(a => a.id === article.nextSuggested)
    : null;

  return (
    <SupportLayout
      headerSearch={<SupportSearchBar query={searchQuery} setQuery={setSearchQuery} />}
    >
      <Head>
        <title>{article.title} | JassGuru Support</title>
        <meta name="description" content={article.description} />
      </Head>

      {/* Breadcrumb */}
      <nav className="pt-6 pb-2 flex items-center gap-2 text-sm">
        <Link
          href="/support"
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Support
        </Link>
        <ChevronRight size={14} className="text-gray-600" />
        <span className="text-gray-500">{article.category.main}</span>
      </nav>

      {/* Article Content — max-w-3xl centered for readability */}
      <article className="max-w-3xl mx-auto">

        {/* Article Header */}
        <header className="pt-4 pb-8 border-b border-white/[0.06] mb-8">
          <div className="flex items-center gap-2.5 mb-4">
            <div className={cn("p-1.5 rounded-lg", categoryColor)}>
              <Icon size={16} />
            </div>
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              {article.category.main}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
            {article.title}
          </h1>
          <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
            {article.description}
          </p>
        </header>

        {/* Steps */}
        {article.steps && article.steps.length > 0 ? (
          <div className="space-y-10 mb-12">
            {article.steps.map((step, index) => (
              <div key={step.number} className="relative pl-12">
                {/* Connector line */}
                {index < article.steps.length - 1 && (
                  <div className="absolute left-[15px] top-10 bottom-[-40px] w-px bg-white/[0.06]" />
                )}

                {/* Step badge */}
                <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-sm font-bold text-gray-300">
                  {step.number}
                </div>

                {/* Step content */}
                <div>
                  <p className="text-gray-200 text-base sm:text-lg font-medium mb-3 leading-relaxed">
                    {step.text}
                  </p>

                  {step.image && (
                    <div className="my-4 rounded-2xl overflow-hidden border border-white/[0.06] bg-black/20">
                      <div className="relative aspect-[9/16] w-full max-w-xs mx-auto">
                        <Image
                          src={getImageUrl(step.image)}
                          alt={`Schritt ${step.number}`}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, 320px"
                        />
                      </div>
                    </div>
                  )}

                  {step.tip && (
                    <div className="mt-3 flex gap-3 p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/[0.12] text-blue-200 text-base">
                      <Lightbulb size={18} className="shrink-0 mt-0.5 text-blue-400" />
                      <span>{step.tip}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="prose prose-invert max-w-none mb-12">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.description}
            </ReactMarkdown>
          </div>
        )}

        {/* Tips */}
        {article.tips && article.tips.length > 0 && (
          <div className="bg-yellow-500/[0.04] border border-yellow-500/[0.08] rounded-2xl p-5 sm:p-6 mb-10">
            <h3 className="text-base font-bold text-yellow-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Lightbulb size={18} />
              Gut zu wissen
            </h3>
            <ul className="space-y-3">
              {article.tips.map((tip, i) => (
                <li key={i} className="text-gray-300 text-base flex gap-2.5">
                  <span className="text-yellow-500/60 mt-2 text-[8px]">●</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* FAQ */}
        {article.faq && article.faq.length > 0 && (
          <div className="mb-10">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <HelpCircle size={20} className="text-blue-400" />
              Häufige Fragen
            </h3>
            <div className="grid gap-2.5">
              {article.faq.map((faq, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-5">
                  <h4 className="font-medium text-gray-200 mb-2 text-base">{faq.question}</h4>
                  <p className="text-base text-gray-400 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Suggested */}
        {nextArticle && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 sm:p-6 mb-10">
            <p className="text-base text-gray-500 mb-3">
              {article.nextSuggestedText || 'Nächster empfohlener Schritt:'}
            </p>
            <Link
              href={`/support/${nextArticle.id}`}
              className="flex items-center gap-3 group"
            >
              <div className={cn("p-2 rounded-lg shrink-0", getCategoryColor(nextArticle.category.mainId))}>
                {React.createElement(getCategoryIcon(nextArticle.category.mainId), { size: 20 })}
              </div>
              <span className="text-base font-medium text-white group-hover:text-blue-400 transition-colors">
                {nextArticle.title}
              </span>
              <ArrowRight size={18} className="ml-auto text-gray-600 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        )}

        {/* Feedback */}
        <div className="py-8 border-t border-white/[0.06]">
          <h4 className="text-center text-base font-medium text-gray-400 mb-4">
            War dieser Artikel hilfreich?
          </h4>
          <div className="flex justify-center gap-3">
            <Button
              size="sm"
              onClick={() => handleHelpful(true)}
              className={cn(
                "gap-2 min-w-[100px] text-white font-bold rounded-xl shadow-lg border-b-4 transition-all",
                helpfulState === 'yes'
                  ? "bg-green-600 hover:bg-green-700 border-green-900"
                  : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.03]"
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
                  : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.03]"
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
          <div className="pb-8 border-t border-white/[0.06] pt-6">
            <h4 className="text-base font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Auch interessant
            </h4>
            <div className="grid gap-2">
              {relatedArticles.map(related => (
                <Link
                  key={related.id}
                  href={`/support/${related.id}`}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div className={cn("p-1.5 rounded-lg shrink-0", getCategoryColor(related.category.mainId))}>
                    {React.createElement(getCategoryIcon(related.category.mainId), { size: 14 })}
                  </div>
                  <span className="text-base text-gray-300 group-hover:text-white transition-colors">
                    {related.title}
                  </span>
                  <ChevronRight size={14} className="ml-auto text-gray-600 group-hover:text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Dezenter Kontakt */}
        <div className="text-center py-8 border-t border-white/[0.06]">
          <p className="text-sm text-gray-500 mb-1">
            Nicht gefunden was du suchst?
          </p>
          <a
            href="mailto:info@jassverband.ch"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Schreib uns an info@jassverband.ch
          </a>
        </div>
      </article>
    </SupportLayout>
  );
}
