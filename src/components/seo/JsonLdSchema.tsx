import React from 'react';

interface BreadcrumbItem {
  name: string;
  href: string;
}

interface ArticleData {
  headline: string;
  description: string;
  authorName: string;
  publisherName: string;
  publisherLogoUrl: string;
  datePublished: string;
  dateModified: string;
}

interface JsonLdSchemaProps {
  articleData: ArticleData;
  breadcrumbItems: BreadcrumbItem[];
  canonicalUrl: string;
  siteUrl: string;
}

export const JsonLdSchema: React.FC<JsonLdSchemaProps> = ({ articleData, breadcrumbItems, canonicalUrl, siteUrl }) => {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    "mainEntityOfPage": {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    "headline": articleData.headline,
    "description": articleData.description,
    "author": {
      '@type': 'Person',
      "name": articleData.authorName,
    },
    "publisher": {
      '@type': 'Organization',
      "name": articleData.publisherName,
      "logo": {
        '@type': 'ImageObject',
        "url": articleData.publisherLogoUrl,
      },
    },
    "datePublished": articleData.datePublished,
    "dateModified": articleData.dateModified,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    "itemListElement": breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      "position": index + 1,
      "name": item.name,
      "item": item.href.startsWith('http') ? item.href : new URL(item.href, siteUrl).toString(),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}; 