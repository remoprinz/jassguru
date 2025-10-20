import { globby } from 'globby';
import { writeFile } from 'fs/promises';
import prettier from 'prettier';

async function generateSitemap() {
  const pages = await globby([
    'src/pages/**/*.tsx',
    '!src/pages/_*.tsx',
    '!src/pages/api',
    '!src/pages/404.tsx',
    // Add any other pages you want to exclude
  ]);

  const sitemap = `
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${pages
        .map((page) => {
          const path = page
            .replace('src/pages', '')
            .replace('.tsx', '')
            .replace('/index', '');
          const route = path === '' ? '/' : path;
          return `<url><loc>${`https://www.jassguru.ch${route}`}</loc></url>`;
        })
        .join('')}
    </urlset>
  `;

  const formattedSitemap = await prettier.format(sitemap, {
    parser: 'html',
  });

  await writeFile('public/sitemap.xml', formattedSitemap);
  console.log('Sitemap generated successfully!');
}

generateSitemap(); 