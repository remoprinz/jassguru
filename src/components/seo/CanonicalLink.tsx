import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * Generiert den korrekten Canonical-Link-Tag, um Duplicate Content zu vermeiden
 * und die SEO-Autorität auf jasswiki.ch zu konsolidieren.
 */
export const CanonicalLink = () => {
  const router = useRouter();
  const [canonicalUrl, setCanonicalUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const path = router.asPath;

      // Fall 1: Wir sind auf jasswiki.ch
      // Der Canonical-Link zeigt immer auf die jasswiki.ch-Version.
      if (host.includes('jasswiki.ch')) {
        setCanonicalUrl(`https://jasswiki.ch${path}`);
      }
      // Fall 2: Wir sind auf jassguru.ch, aber auf einer WISSEN-Seite
      // Der Canonical-Link muss auf die jasswiki.ch-Version zeigen, um Duplicate Content zu vermeiden.
      else if (host.includes('jassguru.ch') && path.startsWith('/wissen')) {
        const wikiPath = path.substring('/wissen'.length);
        setCanonicalUrl(`https://jasswiki.ch${wikiPath || '/'}`);
      }
       // Fall 3: Wir sind auf jassguru.ch auf einer Quellen-Seite
      else if (host.includes('jassguru.ch') && path.startsWith('/quellen')) {
        setCanonicalUrl(`https://jasswiki.ch${path}`);
      }
      // Fall 4: Wir sind auf jassguru.ch auf einer normalen App-Seite
      // Der Canonical-Link ist selbst-referenzierend.
      else {
        setCanonicalUrl(`https://jassguru.ch${path}`);
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
