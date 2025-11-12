import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * Generiert den korrekten Canonical-Link-Tag für SEO.
 */
export const CanonicalLink = () => {
  const router = useRouter();
  const [canonicalUrl, setCanonicalUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const path = router.asPath;
      const pathname = path.split('?')[0]?.split('#')[0] || '/';
      const normalizePath = (input: string) =>
        input.endsWith('/') ? input : `${input}/`;
      const wikiBase =
        process.env.NEXT_PUBLIC_JASSWIKI_URL || 'https://jasswiki.ch';
      const guruBase =
        process.env.NEXT_PUBLIC_SITE_URL || 'https://jassguru.ch';

      // Fall 1: Wir sind auf jasswiki.ch
      // Der Canonical-Link zeigt immer auf die jasswiki.ch-Version.
      if (host.includes('jasswiki.ch')) {
        setCanonicalUrl(`${wikiBase}${normalizePath(pathname)}`);
      }
      // Fall 2: Wir sind auf jassguru.ch auf einer normalen App-Seite
      // Der Canonical-Link ist selbst-referenzierend.
      else {
        setCanonicalUrl(`${guruBase}${normalizePath(pathname)}`);
      }
    }
  }, [router.asPath]);

  if (!canonicalUrl) {
    return null;
  }

  return (
    <Head>
      <link rel="canonical" href={canonicalUrl} />
    </Head>
  );
};
