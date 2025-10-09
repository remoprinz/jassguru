/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://jasswiki.ch',
  generateRobotsTxt: false, // robots.txt wird von der Hauptkonfiguration gesteuert
  outDir: './out',
  
  // Beschränke die Sitemap auf die Wiki-Seiten
  transform: async (config, path) => {
    // Schliesse alle Nicht-Wissen-Pfade aus
    if (!path.startsWith('/wissen') && path !== '/quellen') {
      return null
    }

    // Wandle /wissen/pfad zu /pfad um
    let newPath = path;
    if (path.startsWith('/wissen')) {
      newPath = path.replace('/wissen', '');
      // Handle den Fall der Homepage /wissen -> /
      if (newPath === '') {
        newPath = '/';
      }
    }

    return {
      loc: newPath, // The new path
      changefreq: config.changefreq,
      priority: config.priority,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
      alternateRefs: config.alternateRefs ?? [],
    }
  },
}
