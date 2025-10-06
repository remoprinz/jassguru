import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toSlug } from '@/lib/utils';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';

// Erstelle eine Map für schnellen Zugriff auf Link-Ziele (3-Ebenen URLs)
const linkMap = new Map<string, string>();
Object.values(allContent as JassContentRecord).forEach(item => {
    const mainCatSlug = toSlug(item.metadata.category.main);
    const subCatSlug = toSlug(item.metadata.category.sub);
    const topicSlug = toSlug(item.metadata.category.topic);
    const path = `/wissen/${mainCatSlug}/${subCatSlug}/${topicSlug}`;

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

/**
 * Component, der Text rendert und automatisch interne Links zu anderen Wissensartikeln erstellt
 */
export const InternalLinker: React.FC<InternalLinkerProps> = ({ text }) => {
  // Verwende ReactMarkdown für Markdown-Rendering
  return (
    <div className="prose prose-invert prose-lg max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom renderer für Links
          a: ({ node, href, children, ...props }) => {
            // Prüfe ob es ein externer Link ist
            if (href?.startsWith('http')) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 underline" {...props}>
                  {children}
                </a>
              );
            }
            
            // Interner Link
            return (
              <Link href={href || '#'} className="text-green-400 hover:text-green-300 underline">
                {children}
              </Link>
            );
          },
          // Formatiere Listen besser
          ul: ({ node, children, ...props }) => (
            <ul className="list-disc list-inside space-y-2 my-4" {...props}>
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol className="list-decimal list-inside space-y-2 my-4" {...props}>
              {children}
            </ol>
          ),
          // Formatiere Überschriften
          h2: ({ node, children, ...props }) => (
            <h2 className="text-2xl font-bold mt-8 mb-4 text-white" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3 className="text-xl font-bold mt-6 mb-3 text-white" {...props}>
              {children}
            </h3>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

