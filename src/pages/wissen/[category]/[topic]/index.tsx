import React, { useEffect } from 'react';
import { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import allContent from '@/data/jass-lexikon.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';
import { toSlug } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { InternalLinker } from '@/components/layout/InternalLinker';
import Head from 'next/head';
import { JsonLdSchema } from '@/components/seo/JsonLdSchema';
import { useRouter } from 'next/router';


interface JassWissenPageProps {
  contentItem: JassContentItem;
  category: string;
  topic: string;
}

const JassWissenPage: NextPage<JassWissenPageProps> = ({ contentItem, category, topic }) => {
  const router = useRouter();
  const canonicalUrl = `https://jassguru.ch${router.asPath}`;

  if (!contentItem) {
    return <div>Artikel nicht gefunden.</div>;
  }

  const breadcrumbItems = [
    { name: 'Wissen', href: '/wissen' }, // Annahme: Es wird eine Übersichtsseite geben
    { name: contentItem.metadata.category.main, href: `/wissen/${category}` },
    { name: contentItem.metadata.category.topic, href: `/wissen/${category}/${topic}` },
  ];

  const pageTitle = `${contentItem.metadata.category.topic} - ${contentItem.metadata.category.main} | Jassguru.ch`;
  const metaDescription = `Alles über "${contentItem.metadata.category.topic}" beim Jassen. Erfahre die Regeln und Details zu ${contentItem.metadata.category.main} auf Jassguru.ch.`;

  // Daten für das JSON-LD-Schema
  const articleData = {
    headline: contentItem.metadata.category.topic,
    description: metaDescription,
    authorName: 'Jassguru.ch Team',
    publisherName: 'Jassguru.ch',
    publisherLogoUrl: 'https://jassguru.ch/apple-touch-icon.png',
    datePublished: '2023-01-01', // Statisch, da Inhalt versioniert ist
    dateModified: new Date().toISOString().split('T')[0],
  };

  // Enable scrolling for knowledge pages
  useEffect(() => {
    // Add class to enable scrolling
    document.body.classList.add('lexikon-page');
    
    // Cleanup: Remove class when component unmounts
    return () => {
      document.body.classList.remove('lexikon-page');
    };
  }, []);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={articleData.datePublished} />
        <meta property="article:modified_time" content={articleData.dateModified} />
        <meta property="article:author" content={articleData.authorName} />
        <meta property="article:section" content={contentItem.metadata.category.main} />
        <JsonLdSchema articleData={articleData} breadcrumbItems={breadcrumbItems} baseUrl="https://jassguru.ch" />
      </Head>
      <LexikonLayout breadcrumbItems={breadcrumbItems}>
        <div className="space-y-6 sm:space-y-8">
          {/* Article Header */}
          <header className="text-center pb-6 border-b border-gray-600">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              {contentItem.metadata.category.topic}
            </h1>
            <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-gray-300">
              <span className="px-3 py-1 bg-green-600 text-white rounded-full font-medium">
                {contentItem.metadata.category.main}
              </span>
            </div>
          </header>

          {/* Article Content */}
          <article className="prose prose-lg sm:prose-xl max-w-none">
            <div className="content-formatting">
              <InternalLinker text={contentItem.text} />
            </div>
          </article>

          {/* Navigation Footer */}
          <footer className="pt-8 border-t border-gray-600">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <a 
                href={`/wissen/${category}`}
                className="inline-flex items-center px-4 py-2 text-gray-300 hover:text-green-400 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Zurück zu {contentItem.metadata.category.main}
              </a>
              
              <a 
                href="https://chat.jassguru.ch"
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-yellow-600 text-white rounded-lg hover:from-green-700 hover:to-yellow-700 transition-all font-medium text-center shadow-lg"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.456L3 21l2.456-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                </svg>
                Fragen zum Thema?
              </a>
            </div>
          </footer>

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
      topic: toSlug(item.metadata.category.topic),
    },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { params } = context;
  const category = params?.category as string;
  const topic = params?.topic as string;

  const content: JassContentRecord = allContent;
  const contentItem = (Object.values(content) as JassContentItem[]).find(
    (item) =>
      toSlug(item.metadata.category.main) === category &&
      toSlug(item.metadata.category.topic) === topic
  );

  if (!contentItem) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      contentItem,
      category,
      topic,
    },
  };
};

export default JassWissenPage; 