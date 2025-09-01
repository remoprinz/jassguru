import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toSlug } from '@/lib/utils';
import allContent from '@/data/jass-lexikon.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';

// Erstelle eine Map für schnellen Zugriff auf Link-Ziele
const linkMap = new Map<string, string>();
Object.values(allContent as JassContentRecord).forEach(item => {
    const mainCatSlug = toSlug(item.metadata.category.main);
    const topicSlug = toSlug(item.metadata.category.topic);
    const path = `/wissen/${mainCatSlug}/${topicSlug}`;

    // Hauptthema als Schlüssel
    linkMap.set(item.metadata.category.topic.toLowerCase(), path);
    // Auch Keywords als Schlüssel hinzufügen
    item.metadata.keywords.forEach(keyword => {
        linkMap.set(keyword.toLowerCase(), path);
    });
});

interface InternalLinkerProps {
  text: string;
}

export const InternalLinker: React.FC<InternalLinkerProps> = ({ text }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...props }) => {
          // Behalte externe Links bei
          if (props.href && (props.href.startsWith('http') || props.href.startsWith('mailto'))) {
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          }
          // Interne Links aus dem Markdown
          return <Link href={props.href || ''} legacyBehavior><a {...props} /></Link>;
        },
        p: ({ children }) => {
          const processedChildren = React.Children.toArray(children).flatMap((child) => {
            if (typeof child === 'string') {
              const words = child.split(/(\s+)/);
              return words.map((word, index) => {
                const cleanWord = word.replace(/[.,!?:;()"“”]/g, '').toLowerCase();
                if (linkMap.has(cleanWord)) {
                  return (
                    <Link href={linkMap.get(cleanWord)!} legacyBehavior key={index}>
                      <a className="text-white hover:text-green-400 underline decoration-1 underline-offset-2 font-medium transition-colors">{word}</a>
                    </Link>
                  );
                }
                return word;
              });
            }
            return child;
          });
          return <p className="mb-4">{processedChildren}</p>;
        },
        // Weitere Komponenten für bessere Formatierung
        h1: ({ children }) => <h1 className="text-3xl font-bold mb-6 text-gray-900">{children}</h1>,
        h2: ({ children }) => <h2 className="text-2xl font-bold mb-4 mt-8 text-gray-800">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xl font-semibold mb-3 mt-6 text-gray-700">{children}</h3>,
        ul: ({ children }) => <ul className="space-y-2 mb-6">{children}</ul>,
        ol: ({ children }) => <ol className="space-y-2 mb-6">{children}</ol>,
        li: ({ children }) => <li className="flex items-start">{children}</li>,
        strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}; 