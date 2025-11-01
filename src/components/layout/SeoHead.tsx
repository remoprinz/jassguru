import Head from 'next/head';
import { useRouter } from 'next/router';

interface SeoHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

// Für jasswiki.ch wird die Sitemap-Umgebung verwendet
// Beim Build wird NEXT_PUBLIC_WIKI_MODE gesetzt, um die richtige Domain zu verwenden
const SITE_URL = process.env.NEXT_PUBLIC_WIKI_MODE === 'true' 
  ? 'https://jasswiki.ch' 
  : 'https://jassguru.ch';
const WIKI_SITE_URL = 'https://jasswiki.ch';

export const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  canonicalUrl,
  noIndex,
}) => {
  const router = useRouter();

  // Für /wissen Seiten: Immer jasswiki.ch als canonical (auch wenn auf jassguru.ch gehosted)
  // Dies verhindert Duplicate Content und konsolidiert SEO-Autorität
  // Auf jasswiki.ch sind URLs ohne /wissen Prefix (z.B. /regeln/... statt /wissen/regeln/...)
  let generatedCanonicalUrl: string;
  if (router.asPath.startsWith('/wissen') || router.asPath.startsWith('/quellen')) {
    // Wiki-Seiten: Auf jasswiki.ch ohne /wissen Prefix
    let wikiPath = router.asPath.startsWith('/wissen') 
      ? router.asPath.replace('/wissen', '') || '/' 
      : router.asPath;
    wikiPath = wikiPath.endsWith('/') ? wikiPath : wikiPath + '/';
    generatedCanonicalUrl = `${WIKI_SITE_URL}${wikiPath}`;
  } else {
    // Normale App-Seiten: Die aktuelle Domain verwenden
    generatedCanonicalUrl = `${SITE_URL}${router.asPath.endsWith('/') ? router.asPath : router.asPath + '/'}`;
  }
  
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
