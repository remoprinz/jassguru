import React from 'react';

interface FaqJsonLdSchemaProps {
  question: string;
  answer: string;
}

export const FaqJsonLdSchema: React.FC<FaqJsonLdSchemaProps> = ({ question, answer }) => {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
    />
  );
};
