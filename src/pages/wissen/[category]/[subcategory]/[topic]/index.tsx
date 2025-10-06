import React, { useEffect } from 'react';
import { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import Link from 'next/link';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';
import { toSlug } from '@/lib/utils';
import { InternalLinker } from '@/components/layout/InternalLinker';
import { SeoHead } from '@/components/layout/SeoHead';
import { JsonLdSchema } from '@/components/seo/JsonLdSchema';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { RelatedTopics } from '@/components/wissen/RelatedTopics';

interface JassWissenPageProps {
  contentItem: JassContentItem;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  topic: string;
  topicSlug: string;
}

const JassWissenPage: NextPage<JassWissenPageProps> = ({
  contentItem,
  category,
  categorySlug,
  subcategory,
  subcategorySlug,
  topic,
  topicSlug
}) => {
  const router = useRouter();

  // Fallback während SSG
  if (router.isFallback) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Lädt...</p>
        </div>
      </div>
    );
  }

  if (!contentItem) {
    return <div>Artikel nicht gefunden.</div>;
  }

  const breadcrumbItems = [
    { name: 'Wissen', href: '/wissen' },
    { name: category, href: `/wissen/${categorySlug}` },
    { name: subcategory, href: `/wissen/${categorySlug}/${subcategorySlug}` },
    { name: topic, href: `/wissen/${categorySlug}/${subcategorySlug}/${topicSlug}` },
  ];

  const pageTitle = `${topic} - ${subcategory} | Jassguru.ch`;
  const metaDescription = `Alles über "${topic}" beim Jassen. ${subcategory} - detailliert erklärt auf Jassguru.ch.`;

  // Daten für das JSON-LD-Schema
  const articleData = {
    headline: topic,
    description: metaDescription,
    authorName: 'Jassguru.ch Team',
    publisherName: 'Jassguru.ch',
    publisherLogoUrl: 'https://jassguru.ch/apple-touch-icon.png',
    datePublished: '2023-01-01',
    dateModified: new Date().toISOString().split('T')[0],
  };

  // Scrolling für Wissensseiten aktivieren
  useEffect(() => {
    document.body.classList.add('lexikon-page');
    
    return () => {
      document.body.classList.remove('lexikon-page');
    };
  }, []);

  // Schwierigkeitsgrad visualisieren
  const difficultyLabel = {
    1: 'Einfach',
    2: 'Mittel',
    3: 'Fortgeschritten'
  }[contentItem.metadata.difficulty] || 'Mittel';

  const difficultyStars = '⭐'.repeat(contentItem.metadata.difficulty);

  return (
    <>
      <SeoHead
        title={pageTitle}
        description={metaDescription}
      />
      <Head>
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={articleData.datePublished} />
        <meta property="article:modified_time" content={articleData.dateModified} />
        <meta property="article:author" content={articleData.authorName} />
        <meta property="article:section" content={category} />
        <JsonLdSchema articleData={articleData} breadcrumbItems={breadcrumbItems} baseUrl="https://jassguru.ch" />
      </Head>
      <LexikonLayout breadcrumbItems={breadcrumbItems}>
        <div className="space-y-6 sm:space-y-8">
          {/* Artikel-Header */}
          <header className="text-center pb-6 border-b border-gray-600">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              {topic}
            </h1>
            <div className="flex items-center justify-center gap-4 text-sm sm:text-base text-gray-300 flex-wrap">
              {/* Kategorie */}
              <span className="px-3 py-1 bg-green-600 text-white rounded-full font-medium">
                {category}
              </span>
              
              {/* Unterkategorie */}
              <span className="px-3 py-1 bg-blue-600 text-white rounded-full font-medium">
                {subcategory}
              </span>
              
              {/* Schwierigkeit */}
              <span className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full font-medium">
                {difficultyStars} {difficultyLabel}
              </span>
              
              {/* Wichtig-Badge */}
              {contentItem.metadata.importance >= 0.8 && (
                <span className="px-3 py-1 bg-yellow-600 text-white rounded-full font-medium">
                  ⚡ Wichtig
                </span>
              )}
            </div>
          </header>

          {/* Artikel-Inhalt */}
          <article className="prose prose-lg sm:prose-xl max-w-none prose-invert">
            <div className="content-formatting text-gray-200">
              <InternalLinker text={contentItem.text} />
            </div>
          </article>

          {/* Quelle */}
          {contentItem.metadata.source && (
            <div className="pt-4 text-sm text-gray-400 italic">
              Quelle: {contentItem.metadata.source}
            </div>
          )}

          {/* Navigation Footer */}
          <footer className="pt-8 border-t border-gray-600">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <a 
                href={`/wissen/${categorySlug}/${subcategorySlug}`}
                className="inline-flex items-center px-4 py-2 text-gray-300 hover:text-green-400 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Zurück zu {subcategory}
              </a>
              
              <a 
                href="https://chat.jassguru.ch"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-yellow-600 text-white rounded-lg hover:from-green-700 hover:to-yellow-700 transition-all font-medium text-center shadow-lg"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.456L3 21l2.456-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                </svg>
                Fragen zum Thema?
              </a>
            </div>
          </footer>

          {/* VERWANDTE THEMEN */}
          <RelatedTopics
            currentArticleId={contentItem.id}
            currentCategory={contentItem.metadata.category.main}
            currentKeywords={contentItem.metadata.keywords}
            maxResults={4}
          />

          {/* QUELLEN SEKTION */}
          <div className="mt-10 pt-6 border-t border-gray-700">
            <div className="bg-gray-800/50 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-2">Quelle</h3>
                  <p className="text-gray-300 text-sm mb-3">
                    <strong>Basierend auf:</strong> {contentItem.metadata.source}
                  </p>
                  <Link 
                    href="/quellen"
                    className="inline-flex items-center text-green-400 hover:text-green-300 text-sm font-medium"
                  >
                    Alle Quellen & Literatur anzeigen
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* APP-CTA SEKTION */}
          <div className="mt-12 pt-8 border-t border-gray-600">
            <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-xl p-6 sm:p-8 text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                🎯 Bereit zum Jassen?
              </h3>
              <p className="text-green-100 mb-6 text-base sm:text-lg">
                Nutze dein Wissen in der digitalen Jasstafel! Spiele mit Freunden und führe Statistiken.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a 
                  href="/"
                  className="inline-flex items-center justify-center px-6 py-3 bg-white text-green-600 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-bold text-base sm:text-lg min-h-[48px] shadow-lg"
                >
                  🚀 Jetzt kostenlos spielen
                </a>
                <a 
                  href="/"
                  className="inline-flex items-center justify-center px-6 py-3 bg-transparent border-2 border-white text-white rounded-lg hover:bg-white hover:text-green-600 transition-colors duration-200 font-medium text-base sm:text-lg min-h-[48px]"
                >
                  📱 App entdecken
                </a>
              </div>
            </div>
          </div>
        </div>
      </LexikonLayout>
    </>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const content: JassContentRecord = allContent;
  const paths = (Object.values(content) as JassContentItem[]).map((item) => ({
    params: {
      category: toSlug(item.metadata.category.main),
      subcategory: toSlug(item.metadata.category.sub),
      topic: toSlug(item.metadata.category.topic),
    },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { params } = context;
  const categorySlug = params?.category as string;
  const subcategorySlug = params?.subcategory as string;
  const topicSlug = params?.topic as string;

  const content: JassContentRecord = allContent;
  const contentItem = (Object.values(content) as JassContentItem[]).find(
    (item) =>
      toSlug(item.metadata.category.main) === categorySlug &&
      toSlug(item.metadata.category.sub) === subcategorySlug &&
      toSlug(item.metadata.category.topic) === topicSlug
  );

  if (!contentItem) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      contentItem,
      category: contentItem.metadata.category.main,
      categorySlug,
      subcategory: contentItem.metadata.category.sub,
      subcategorySlug,
      topic: contentItem.metadata.category.topic,
      topicSlug,
    },
  };
};

export default JassWissenPage;

