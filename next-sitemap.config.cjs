/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://jassguru.ch',
  generateRobotsTxt: true,
  outDir: './out',
  // Verhindert das Aufteilen in mehrere sitemap-*.xml Dateien
  generateIndexSitemap: false,
  // SEO-Optimierung für Wissen-Seiten
  transform: async (config, path) => {
    let priority = 0.5; // Standard-Priorität für App-Seiten
    let changefreq = 'monthly';

    // Höchste Priorität für Homepage
    if (path === '/') {
      priority = 1.0;
      changefreq = 'daily';
    } 
    // Hohe Priorität für Wissen-Hub
    else if (path === '/wissen') {
      priority = 0.9;
      changefreq = 'weekly';
    } 
    // Mittlere Priorität für Kategorien
    else if (path.match(/^\/wissen\/[^\\/]+$/)) {
      priority = 0.8;
      changefreq = 'weekly';
    } 
    // Standard Priorität für Artikel
    else if (path.startsWith('/wissen/')) {
      priority = 0.7;
      changefreq = 'monthly';
    }

    return {
      loc: path,
      changefreq: changefreq,
      priority: priority,
      lastmod: new Date().toISOString(),
    };
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: '*',
        allow: '/wissen/',
      },
    ],
    additionalSitemaps: [
      'https://jassguru.ch/sitemap.xml',
    ],
  },
}; 