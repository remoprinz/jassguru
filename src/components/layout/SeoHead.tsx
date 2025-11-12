import Head from 'next/head';
import { useRouter } from 'next/router';

interface SeoHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://jassguru.ch';

export const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  canonicalUrl,
  noIndex,
}) => {
  const router = useRouter();

    // Normale App-Seiten: Die aktuelle Domain verwenden
  const generatedCanonicalUrl = `${SITE_URL}${router.asPath.endsWith('/') ? router.asPath : router.asPath + '/'}`;
  const finalCanonicalUrl = canonicalUrl || generatedCanonicalUrl;
  
  const defaultTitle = 'Jassguru.ch - Die Jass-Community in deiner Tasche';
  const defaultDescription = 'Schneller, smarter, vernetzter Jassen. Deine digitale Jasstafel für Ranglisten, Statistiken und Turniere. Werde Teil der Jass-Community!';

  return (
    <Head>
      <title>{title || defaultTitle}</title>
      <meta name="description" content={description || defaultDescription} />

      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <link rel="canonical" href={finalCanonicalUrl} />
      )}
      
      {/* Weitere wichtige SEO-Tags, die global gelten */}
      <meta property="og:site_name" content="Jassguru" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title || defaultTitle} />
      <meta property="og:description" content={description || defaultDescription} />
      <meta property="og:url" content={finalCanonicalUrl} />
      <meta property="og:image" content="https://jassguru.ch/apple-touch-icon.png" />
      <meta name="twitter:card" content="summary_large_image" />
    </Head>
  );
};
