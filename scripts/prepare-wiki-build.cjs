const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Definiere die Verzeichnisse
const outDir = path.join(__dirname, '../out');
const outWikiDir = path.join(__dirname, '../out-wiki');
const publicDir = path.join(__dirname, '../public');

console.log('--- JassWiki Post-Build-Skript startet ---');
console.log(`Quelle (out): ${outDir}`);
console.log(`Ziel (out-wiki): ${outWikiDir}`);
console.log(`Public Assets: ${publicDir}`);

// Stellt sicher, dass das Zielverzeichnis existiert
if (!fs.existsSync(outWikiDir)) {
    fs.mkdirSync(outWikiDir, { recursive: true });
}

// 1. Kopiere den '/wissen' Inhalt und andere relevante Dateien
// Wir kopieren den gesamten out-Ordner, um alle Next.js Assets zu erhalten
console.log('1. Kopiere Build-Artefakte von out nach out-wiki...');
fs.cpSync(outDir, outWikiDir, { recursive: true });
console.log('   Kopieren abgeschlossen.');


// 2. Transformiere die URLs in den HTML-Dateien
console.log('2. Transformiere URLs in HTML-Dateien...');
const htmlFiles = glob.sync(`${outWikiDir}/**/*.html`);

htmlFiles.forEach(file => {
    try {
        let content = fs.readFileSync(file, 'utf8');
        let changed = false;

        // Ersetze Domain und Pfade in Meta-Tags und Links
        const replacements = [
            { from: /https:\/\/jassguru\.ch\/wissen\//g, to: 'https://jasswiki.ch/' },
            { from: /https:\/\/jassguru\.ch\//g, to: 'https://jasswiki.ch/' },
            { from: /jassguru\.ch/g, to: 'jasswiki.ch' },
            { from: /Jassguru\.ch/g, to: 'JassWiki.ch' },
            { from: /Jassguru/g, to: 'JassWiki' },
            { from: /"\/wissen\//g, to: '"/' }, // Für interne Links
            { from: /'\/wissen\//g, to: "'/" } // Für interne Links mit einfachen Anführungszeichen
        ];

        replacements.forEach(rep => {
            if (content.includes(rep.from.source ? rep.from.source.replace(/\\/g, '') : rep.from)) {
                content = content.replace(rep.from, rep.to);
                changed = true;
            }
        });

        if (changed) {
            fs.writeFileSync(file, content, 'utf8');
            // console.log(`   - Aktualisiert: ${path.relative(outWikiDir, file)}`);
        }
    } catch (error) {
        console.error(`Fehler bei der Verarbeitung von ${file}:`, error);
    }
});
console.log(`   ${htmlFiles.length} HTML-Dateien verarbeitet.`);


// 3. Transformiere die sitemap.xml
console.log('3. Transformiere sitemap.xml...');
const sitemapPath = path.join(outWikiDir, 'sitemap-0.xml'); // Annahme basierend auf vorheriger Analyse
if (fs.existsSync(sitemapPath)) {
    try {
        let sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
        sitemapContent = sitemapContent.replace(/<loc>https:\/\/jassguru\.ch\/wissen\//g, '<loc>https://jasswiki.ch/');
        sitemapContent = sitemapContent.replace(/<loc>https:\/\/jassguru\.ch\//g, '<loc>https://jasswiki.ch/');
        fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
        console.log('   sitemap.xml erfolgreich transformiert.');
    } catch (error) {
        console.error('Fehler bei der Transformation der sitemap.xml:', error);
    }
} else {
    console.warn(`   Warnung: sitemap-0.xml nicht in ${outWikiDir} gefunden.`);
}


// 4. Bereinige nicht benötigte Dateien im Wiki-Build
console.log('4. Bereinige nicht benötigte Dateien aus dem Wiki-Build...');
const filesToRemove = [
    // Alle HTML-Dateien ausserhalb von 'wissen'
    ...glob.sync(`${outWikiDir}/*.html`).filter(f => !f.endsWith('index.html')),
    `${outWikiDir}/agb.html`,
    `${outWikiDir}/datenschutz.html`,
    `${outWikiDir}/impressum.html`,
    `${outWikiDir}/sitemap-guru.xml`,
    // Lösche Verzeichnisse der App
    `${outWikiDir}/auth`,
    `${outWikiDir}/game`,
    `${outWikiDir}/groups`,
    `${outWikiDir}/profile`,
    `${outWikiDir}/tournaments`,
    `${outWikiDir}/view`,
    `${outWikiDir}/join`,
    `${outWikiDir}/start`
];

filesToRemove.forEach(p => {
    try {
        if (fs.existsSync(p)) {
            fs.rmSync(p, { recursive: true, force: true });
            // console.log(`   - Entfernt: ${path.relative(outWikiDir, p)}`);
        }
    } catch (error) {
        console.error(`Fehler beim Entfernen von ${p}:`, error);
    }
});
console.log('   Bereinigung abgeschlossen.');

// 5. Umstrukturieren des 'wissen' Ordners ins Root
console.log('5. Umstrukturieren des /wissen Ordners...');
const wissenDir = path.join(outWikiDir, 'wissen');

// Rekursive Funktion zum Verschieben von Inhalten
function moveDirContents(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const items = fs.readdirSync(src);
    items.forEach(item => {
        const oldPath = path.join(src, item);
        const newPath = path.join(dest, item);
        const stat = fs.lstatSync(oldPath);
        if (stat.isDirectory()) {
            moveDirContents(oldPath, newPath);
        } else {
            fs.renameSync(oldPath, newPath);
        }
    });
    fs.rmdirSync(src);
}

if (fs.existsSync(wissenDir)) {
    // Verschiebe den Inhalt von 'wissen' ins Root-Verzeichnis von out-wiki
    moveDirContents(wissenDir, outWikiDir);
    console.log('   /wissen Ordner erfolgreich ins Root-Verzeichnis verschoben.');
} else {
    console.log('   Kein /wissen Ordner zum Umstrukturieren gefunden.');
}

console.log('--- JassWiki Post-Build-Skript erfolgreich abgeschlossen ---');
