import React, { useEffect, useState } from 'react';
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
import { FaqJsonLdSchema } from '@/components/seo/FaqJsonLdSchema';
import { stripMarkdown } from '@/lib/markdownUtils';

// Helper to generate a question for FAQ Schema
const generateFaqQuestion = (topic: string, category: string): string => {
  switch (category) {
    case 'Begriffe':
      return `Was bedeutet "${topic}" beim Jassen?`;
    case 'Regeln':
      return `Wie lauten die Jassregeln für "${topic}"?`;
    case 'Weis-Regeln':
      return `Was ist ein "${topic}" Weis und wie viele Punkte zählt er?`;
    case 'Varianten':
      return `Wie spielt man die Jass-Variante "${topic}"?`;
    case 'Schieber':
      return `Was ist die beste Taktik für "${topic}" beim Schieber-Jass?`;
    case 'Jassapps':
      // Spezielle Fragen für Jassapps-Kategorie
      if (topic.toLowerCase().includes('generelles') || topic.toLowerCase().includes('übersicht')) {
        return `Was sind die besten Jassapps für Schweizer Jass?`;
      } else if (topic.toLowerCase().includes('jassguru')) {
        return `Was ist jassguru.ch und wie funktioniert die digitale Jasstafel?`;
      } else if (topic.toLowerCase().includes('jasspro')) {
        return `Wie gut ist die JassPro App zum Online-Jassen?`;
      } else if (topic.toLowerCase().includes('jass24')) {
        return `Was bietet die Jass24 App für Online-Jass?`;
      } else if (topic.toLowerCase().includes('swissjass')) {
        return `Wie funktioniert die SwissJass+ App?`;
      } else if (topic.toLowerCase().includes('jass.ch')) {
        return `Was ist die Jass.ch App von Swisslos?`;
      } else if (topic.toLowerCase().includes('jasstafel')) {
        return `Welche Jasstafel Apps gibt es für Android und iOS?`;
      } else {
        return `Was ist die beste Jassapp für "${topic}"?`;
      }
    default:
      return `Was muss man über "${topic}" beim Jassen wissen?`;
  }
};

// Helper to extract a concise answer for FAQ Schema
const extractFaqAnswer = (text: string): string => {
  // Remove markdown, then take the first paragraph.
  const plainText = stripMarkdown(text);
  const firstParagraph = plainText.split('\n\n')[0];
  // Trim and ensure it's not too long
  return firstParagraph.trim().slice(0, 300) + (firstParagraph.length > 300 ? '...' : '');
};

interface JassWissenPageProps {
  contentItem: JassContentItem;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  topic: string;
  topicSlug: string;
  pageTitle: string;
  metaDescription: string;
}

const JassWissenPage: NextPage<JassWissenPageProps> = ({
  contentItem,
  category,
  categorySlug,
  subcategory,
  subcategorySlug,
  topic,
  topicSlug,
  pageTitle,
  metaDescription,
}) => {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState('https://jassguru.ch');

  useEffect(() => {
    // This check ensures window is defined, meaning we are on the client side.
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname;
      if (currentHost.includes('jasswiki.ch')) {
        setBaseUrl('https://jasswiki.ch');
      }
    }
  }, []);

  // Generate FAQ Schema data
  const faqQuestion = generateFaqQuestion(topic, category);
  const faqAnswer = extractFaqAnswer(contentItem.text);

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
    { name: 'Jass-Wiki', href: '/wissen' },
    { name: category, href: `/wissen/${categorySlug}` },
    { name: subcategory, href: `/wissen/${categorySlug}/${subcategorySlug}` },
    { name: topic, href: `/wissen/${categorySlug}/${subcategorySlug}/${topicSlug}` },
  ];

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

  // Schwierigkeitsgrad visualisieren (nur bei relevanten Kategorien)
  const showDifficulty = ['Varianten', 'Schieber', 'Weis-Regeln'].includes(category);
  
  const difficultyLabel = {
    1: 'Einfach',
    2: 'Mittel',
    3: 'Fortgeschritten',
    4: 'Anspruchsvoll',
    5: 'Experte'
  }[contentItem.metadata.difficulty] || 'Mittel';

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
        <JsonLdSchema articleData={articleData} breadcrumbItems={breadcrumbItems} baseUrl={baseUrl} />
        <FaqJsonLdSchema question={faqQuestion} answer={faqAnswer} />
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
              
              {/* Schwierigkeit - nur bei Varianten, Schieber, Weis-Regeln */}
              {showDifficulty && (
                <span className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full font-medium">
                  {difficultyLabel}
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
                Chatte mit dem Jassguru persönlich
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
                Bereit zum Jassen?
              </h3>
              <p className="text-green-100 mb-6 text-base sm:text-lg">
                Nutze dein Wissen in der digitalen Jasstafel! Spiele mit Freunden und führe Statistiken.
              </p>
              <div className="flex justify-center">
                <a 
                  href="https://jassguru.ch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-green-600 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-bold text-lg sm:text-xl min-h-[56px] shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Jetzt Jassgruppe gründen
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

  const topic = contentItem.metadata.category.topic;
  const subcategory = contentItem.metadata.category.sub;
  const category = contentItem.metadata.category.main;

  // Dynamische SEO-Titel und -Beschreibungen
  let pageTitle = `${topic} - ${subcategory} | Jass-Wiki`;
  let metaDescription = `Alles über "${topic}" beim Jassen in der Kategorie ${subcategory}. Detailliert erklärt im Jass-Wiki der Schweiz.`;

  switch (category) {
    case 'Regeln':
      pageTitle = `Jassregeln für ${topic}: ${subcategory} im Detail erklärt | Jass-Wiki`;
      metaDescription = `Die offiziellen Jassregeln für "${topic}" (${subcategory}). Alle Details, Ausnahmen und Beispiele verständlich erklärt auf jasswiki.ch.`;
      break;
    case 'Weis-Regeln':
      pageTitle = `${topic}: Die Regeln für Weispunkte, Stöck & Bock | Jass-Wiki`;
      metaDescription = `Alles über den Jass-Weis "${topic}". Erfahre die Regeln, Punktewerte und strategischen Tipps für ${subcategory} im Jass-Wiki.`;
      break;
    case 'Schieber':
      pageTitle = `Jasstipps für ${topic} beim Schieber | Jass-Wiki Schweiz`;
      metaDescription = `Meistere den Schieber mit unseren Jasstipps zu "${topic}". Taktiken und Strategien für ${subcategory} für Anfänger und Profis.`;
      break;
    case 'Begriffe':
      pageTitle = `Was bedeutet "${topic}" beim Jassen? | Jass-Begriffe A-Z | Jass-Wiki`;
      metaDescription = `Die Definition und Bedeutung des Jass-Begriffs "${topic}". Einfach und verständlich erklärt im grossen Jass-Lexikon der Schweiz.`;
      break;
    case 'Varianten':
      pageTitle = `Anleitung für die Jass-Variante "${topic}" | Jass-Wiki`;
      metaDescription = `Lerne die Jass-Variante "${topic}" (${subcategory}). Spielregeln, Anleitung und Punkte einfach erklärt auf jasswiki.ch.`;
      break;
    case 'Jassapps':
      // Spezielle SEO-Titel für Jassapps
      if (topic.toLowerCase().includes('generelles') || topic.toLowerCase().includes('übersicht')) {
        pageTitle = `Die besten Jassapps für Schweizer Jass 2024 | Vergleich & Test`;
        metaDescription = `Entdecke die besten Jassapps für Schweizer Jass: Digitale Jasstafeln, Online-Jass-Apps und Tools. Kompletter Vergleich mit Vor- und Nachteilen.`;
      } else if (topic.toLowerCase().includes('jassguru')) {
        pageTitle = `jassguru.ch: Die digitale Jasstafel mit Datenbank | Jass-Wiki`;
        metaDescription = `jassguru.ch ist die einzige digitale Jasstafel, die Resultate direkt in eine Datenbank schreibt. Elo-Rating, Statistiken und Echtzeit-Synchronisation.`;
      } else if (topic.toLowerCase().includes('jasspro')) {
        pageTitle = `JassPro App Test: Online-Jass gegen KI und Spieler | Jass-Wiki`;
        metaDescription = `JassPro App im Test: Online-Jass gegen Computer und echte Spieler. Features, Kosten und Verfügbarkeit für iOS, Android und Web.`;
      } else if (topic.toLowerCase().includes('jass24')) {
        pageTitle = `Jass24 App: Online-Jass mit Webcam | Jass-Wiki`;
        metaDescription = `Jass24 App für Online-Jass mit Webcam-Integration. Spielmodi, Features und Verfügbarkeit für iOS und Android im Test.`;
      } else if (topic.toLowerCase().includes('swissjass')) {
        pageTitle = `SwissJass+ App: Online-Jass mit KI | Jass-Wiki`;
        metaDescription = `SwissJass+ App für Online-Jass mit künstlicher Intelligenz. Spielmodi, Features und Verfügbarkeit für iOS und Android.`;
      } else if (topic.toLowerCase().includes('jass.ch')) {
        pageTitle = `Jass.ch App von Swisslos: Online-Jass Test | Jass-Wiki`;
        metaDescription = `Jass.ch App von Swisslos im Test: Online-Jass mit verschiedenen Spielmodi. Features, Kosten und Verfügbarkeit für iOS und Android.`;
      } else if (topic.toLowerCase().includes('jasstafel')) {
        pageTitle = `Jasstafel Apps für Android & iOS: Digitale Punktezählung | Jass-Wiki`;
        metaDescription = `Die besten Jasstafel Apps für Android und iOS. Digitale Punktezählung für Schieber, Coiffeur und andere Jass-Varianten.`;
      } else {
        pageTitle = `${topic}: Die beste Jassapp im Test | Jass-Wiki`;
        metaDescription = `${topic} App im Test: Features, Kosten und Verfügbarkeit für Schweizer Jass. Kompletter Vergleich mit anderen Jassapps.`;
      }
      break;
    default:
      // Fallback bleibt generisch, aber optimiert
      pageTitle = `${topic} - ${category} | Das Schweizer Jass-Wiki`;
      metaDescription = `Alles über "${topic}" beim Jassen. Detailliert erklärt im umfassendsten Jass-Wiki der Schweiz.`;
      break;
  }

  return {
    props: {
      contentItem,
      category: category,
      categorySlug,
      subcategory: subcategory,
      subcategorySlug,
      topic: topic,
      topicSlug,
      pageTitle,
      metaDescription,
    },
  };
};

export default JassWissenPage;

