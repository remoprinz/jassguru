#!/usr/bin/env node
/**
 * Export jass-content-v2.json zu Google Spreadsheet
 * 
 * Erstellt zwei Sheets:
 * 1. "Artikel" - Alle Artikel mit Metadaten
 * 2. "FAQs" - Alle FAQs mit Verweis auf Artikel
 */

import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Konvertiert Topic (Titel) zu einer konsistenten ID (wie in jass-content-v2.json)
 * Beispiel: "Abheben der Karten" → "abheben_der_karten"
 * 
 * Muster aus bestehenden IDs:
 * - Unterstriche statt Bindestriche
 * - Alles lowercase
 * - Umlaute werden zu ae/oe/ue/ss
 * - Leerzeichen und Sonderzeichen werden zu Unterstrichen
 */
function topicToId(topic: string): string {
  if (!topic) return '';
  return topic
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '_')  // Unterstriche statt Bindestriche!
    .replace(/(^_|_$)+/g, '')       // Führende/abschließende Unterstriche entfernen
    .replace(/_+/g, '_');           // Mehrfache Unterstriche zu einem
}

// Firebase Admin initialisieren
if (!admin.apps.length) {
  const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'jassguru'
    });
  } catch (error) {
    console.error('Fehler beim Initialisieren von Firebase Admin:', error);
    process.exit(1);
  }
}

// Konfiguration
const SPREADSHEET_ID = "1F6z6e0c0vTTiUsr93tTlZ3JfqpH0CSCpQeFU3q0ynos";
const JASS_CONTENT_PATH = join(__dirname, '../../../jasswiki/src/data/jass-content-v2.json');

interface JassContentItem {
  id: string;
  text: string;
  metadata: {
    category: {
      main: string;
      sub: string;
      topic: string;
    };
    keywords: string[];
    situations: string[];
    importance: number;
    difficulty: number;
  };
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  see_also: string[];
}

interface JassContentData {
  [key: string]: JassContentItem;
}

async function exportToSpreadsheet() {
  console.log('🚀 Starte Export von jass-content-v2.json zu Google Spreadsheet...\n');

  try {
    // 1. JSON-Datei laden
    console.log('📖 Lade jass-content-v2.json...');
    const jsonContent = readFileSync(JASS_CONTENT_PATH, 'utf8');
    const contentData: JassContentData = JSON.parse(jsonContent);
    const articles = Object.values(contentData);
    
    console.log(`✅ ${articles.length} Artikel geladen`);
    
    const totalFaqs = articles.reduce((sum, article) => sum + (article.faqs?.length || 0), 0);
    console.log(`✅ ${totalFaqs} FAQs gefunden\n`);

    // 2. Google Sheets API initialisieren
    console.log('🔐 Initialisiere Google Sheets API...');
    const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    console.log('✅ Google Sheets API initialisiert\n');

    // Kategorien-Hierarchie für Dropdowns
    const categoryHierarchy: Record<string, string[]> = {
      "Begriffe": ["Grundbegriffe", "Kartenbezeichnungen", "Punktebegriffe", "Spezialvarianten", "Spielaktionen"],
      "Geschichte": ["Herkunft", "Industrialisierung", "Kulturelle Bedeutung", "Mittelalter", "Schweizer Kartenherstellung", "Sprachentwicklung", "Ursprünge", "Wortherkunft"],
      "Grundlagen & Kultur": ["Europäischer Kontext", "Grundbegriffe", "Kartensysteme", "Kulturelle Bedeutung", "Regionale Unterschiede", "Spielbegriffe", "Spielmaterial", "Spielvarianten", "Wichtigste Regeln", "Überblick"],
      "Jassapps": ["Generelles", "Online-Jass", "Tisch-Jass"],
      "Referenzen": ["Dokumente", "Experten", "Quellen", "Verwendung"],
      "Regeln": ["Ausmachen", "Fehler & Verstösse", "Kartenverteilung", "Kartenwerte", "Offizielles Regelwerk", "Punktezählung", "Schreiben", "Sonderregeln", "Spielablauf", "Spielende", "Spielziele", "Tischregel"],
      "Taktiken und Strategien": ["Fortgeschrittene Strategien", "Kommunikation & Signale", "Taktische Grundlagen"],
      "Varianten": ["Ablegespiel", "Bessern-Spiel", "Bietspiel", "Doppelkart-Schieber", "Einfacher Jass", "Einzelspiel", "Feste Trumpffarbe", "Fortgeschrittener Bieter", "Gesellschaftsspiel", "Glücksspiel", "Handjass", "Königsspiel", "Lernspiel", "Minus-Spiel", "Schreibspiel", "Schätzspiel", "Serienjass", "Steigerungsspiel", "Stichspiel", "Stichzahl-Spiel", "Stock-Spiel", "Strategiespiel", "Teamspiel", "Traditionelles Spiel", "Vermeidungsspiel", "Zweiersspiel"],
      "Weis-Regeln": ["Allgemeines", "Stöcke", "Weis-Arten"]
    };

    // 3. Sheet 1: Artikel vorbereiten
    console.log('📊 Bereite Artikel-Sheet vor...');
    const articleRows: (string | number)[][] = [];
    
    // Header (Topic zuerst, dann ID - intuitiver für Menschen!)
    articleRows.push([
      'Kategorie (Topic)',  // Spalte A - WICHTIGSTES FELD!
      'Text',                // Spalte B
      'Kategorie (Main)',    // Spalte C
      'Kategorie (Sub)',     // Spalte D
      'ID',                  // Spalte E - automatisch generiert aus Topic
      'Keywords',            // Spalte F
      'Situations',          // Spalte G
      'Importance',          // Spalte H
      'Difficulty',          // Spalte I
      'See Also',            // Spalte J
      'FAQ-Anzahl'           // Spalte K
    ]);

    // Daten
    for (const article of articles) {
      const topic = article.metadata?.category?.topic || '';
      // ID automatisch aus Topic generieren, falls nicht vorhanden
      const articleId = article.id || topicToId(topic);
      
      articleRows.push([
        topic,                                    // Spalte A: Topic (wichtigstes Feld!)
        article.text || '',                        // Spalte B: Text
        article.metadata?.category?.main || '',   // Spalte C: Main
        article.metadata?.category?.sub || '',   // Spalte D: Sub
        articleId,                                // Spalte E: ID (automatisch generiert)
        (article.metadata?.keywords || []).join(', '),  // Spalte F: Keywords
        (article.metadata?.situations || []).join(', '), // Spalte G: Situations
        article.metadata?.importance || 0,        // Spalte H: Importance
        article.metadata?.difficulty || 0,        // Spalte I: Difficulty
        (article.see_also || []).join(', '),      // Spalte J: See Also
        article.faqs?.length || 0                 // Spalte K: FAQ-Anzahl
      ]);
    }
    console.log(`✅ ${articleRows.length - 1} Artikel-Zeilen vorbereitet`);

    // 4. Sheet 2: FAQs vorbereiten
    console.log('📊 Bereite FAQs-Sheet vor...');
    const faqRows: (string | number)[][] = [];
    
    // Header
    faqRows.push([
      'FAQ-ID',
      'Artikel-ID',
      'Frage',
      'Antwort'
    ]);

    // Daten
    let faqCounter = 1;
    for (const article of articles) {
      if (article.faqs && article.faqs.length > 0) {
        for (const faq of article.faqs) {
          faqRows.push([
            `${article.id}_faq_${faqCounter}`,
            article.id,
            faq.question || '',
            faq.answer || ''
          ]);
          faqCounter++;
        }
      }
    }
    console.log(`✅ ${faqRows.length - 1} FAQ-Zeilen vorbereitet\n`);

    // 5. Prüfe ob Sheets existieren, sonst erstellen
    console.log('🔍 Prüfe vorhandene Sheets...');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const existingSheets = spreadsheet.data.sheets || [];
    const sheetNames = existingSheets.map(s => s.properties?.title || '');
    
    console.log(`📋 Vorhandene Sheets: ${sheetNames.join(', ')}`);

    // 5a. Kategorien-Mapping Sheet erstellen/aktualisieren (für Dropdowns)
    console.log('\n📋 Erstelle/aktualisiere Kategorien-Mapping Sheet...');
    let categoriesSheetId: number | undefined;
    const categoriesSheet = existingSheets.find(s => s.properties?.title === '_Kategorien');
    
    if (categoriesSheet) {
      categoriesSheetId = categoriesSheet.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "_Kategorien" existiert bereits (ID: ${categoriesSheetId})`);
    } else {
      const createResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: '_Kategorien',
                hidden: true, // Versteckt für Benutzer
                gridProperties: {
                  rowCount: 50,
                  columnCount: 20
                }
              }
            }
          }]
        }
      });
      categoriesSheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "_Kategorien" erstellt (ID: ${categoriesSheetId}, versteckt)`);
    }
    
    // Kategorien-Daten ins Mapping-Sheet schreiben
    const categoryRows: string[][] = [];
    const mainCategories = Object.keys(categoryHierarchy).sort();
    
    // Header
    categoryRows.push(['Main', 'Sub']);
    
    // Daten: Jede Main-Kategorie mit ihren Subs
    for (const main of mainCategories) {
      const subs = categoryHierarchy[main];
      for (const sub of subs) {
        categoryRows.push([main, sub]);
      }
    }
    
    // Sheet leeren und neu schreiben
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: '_Kategorien!A:Z',
    });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: '_Kategorien!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: categoryRows
      }
    });
    
    // Named Ranges für Dropdowns erstellen
    console.log('📋 Erstelle Named Ranges für Dropdowns...');
    
    // 1. Named Range für Main-Kategorien
    const mainCategoriesRange = {
      name: 'MainCategories',
      range: {
        sheetId: categoriesSheetId,
        startRowIndex: 1,
        endRowIndex: mainCategories.length + 1,
        startColumnIndex: 0,
        endColumnIndex: 1
      }
    };
    
    // 2. Named Ranges für jede Main-Kategorie (für abhängige Subs)
    const namedRanges: any[] = [mainCategoriesRange];
    
    for (const main of mainCategories) {
      const subs = categoryHierarchy[main];
      const startRow = categoryRows.findIndex((row, idx) => idx > 0 && row[0] === main);
      const endRow = startRow + subs.length;
      
      namedRanges.push({
        name: `SubCategories_${main.replace(/[^a-zA-Z0-9]/g, '_')}`,
        range: {
          sheetId: categoriesSheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: 1,
          endColumnIndex: 2
        }
      });
    }
    
    // Named Ranges erstellen/aktualisieren
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: namedRanges.map(nr => ({
            addNamedRange: {
              namedRange: {
                name: nr.name,
                range: {
                  sheetId: nr.range.sheetId,
                  startRowIndex: nr.range.startRowIndex,
                  endRowIndex: nr.range.endRowIndex,
                  startColumnIndex: nr.range.startColumnIndex,
                  endColumnIndex: nr.range.endColumnIndex
                }
              }
            }
          }))
        }
      });
      console.log(`✅ ${namedRanges.length} Named Ranges erstellt`);
    } catch (error) {
      console.log('⚠️  Named Ranges konnten nicht erstellt werden (möglicherweise existieren bereits)');
    }

    // 6. Sheet "Artikel" erstellen oder leeren
    let artikelSheetId: number | undefined;
    const artikelSheet = existingSheets.find(s => s.properties?.title === 'Artikel');
    
    if (artikelSheet) {
      artikelSheetId = artikelSheet.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "Artikel" existiert bereits (ID: ${artikelSheetId})`);
      
      // Sheet leeren
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Artikel!A:Z',
      });
      console.log('🧹 Sheet "Artikel" geleert');
    } else {
      // Neues Sheet erstellen
      const createResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Artikel',
                gridProperties: {
                  rowCount: articleRows.length + 100,
                  columnCount: 11
                }
              }
            }
          }]
        }
      });
      artikelSheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "Artikel" erstellt (ID: ${artikelSheetId})`);
    }

    // 7. Sheet "FAQs" erstellen oder leeren
    let faqsSheetId: number | undefined;
    const faqsSheet = existingSheets.find(s => s.properties?.title === 'FAQs');
    
    if (faqsSheet) {
      faqsSheetId = faqsSheet.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "FAQs" existiert bereits (ID: ${faqsSheetId})`);
      
      // Sheet leeren
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'FAQs!A:Z',
      });
      console.log('🧹 Sheet "FAQs" geleert');
    } else {
      // Neues Sheet erstellen
      const createResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'FAQs',
                gridProperties: {
                  rowCount: faqRows.length + 100,
                  columnCount: 4
                }
              }
            }
          }]
        }
      });
      faqsSheetId = createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
      console.log(`✅ Sheet "FAQs" erstellt (ID: ${faqsSheetId})`);
    }

    // 8. Daten schreiben
    console.log('\n📝 Schreibe Daten in Spreadsheet...');
    
    // Artikel schreiben
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Artikel!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: articleRows
      }
    });
    console.log(`✅ ${articleRows.length - 1} Artikel geschrieben`);

    // FAQs schreiben
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'FAQs!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: faqRows
      }
    });
    console.log(`✅ ${faqRows.length - 1} FAQs geschrieben`);

    // 9. Data Validation für Dropdowns (Main & Sub Kategorien)
    console.log('\n📋 Erstelle Dropdown-Validierungen...');
    
    const validationRequests: any[] = [];
    
    if (artikelSheetId !== undefined) {
      // Main-Kategorie Dropdown (Spalte C)
      // WICHTIG: Bis Zeile 1000, damit auch neue Zeilen Dropdowns haben!
      validationRequests.push({
        setDataValidation: {
          range: {
            sheetId: artikelSheetId,
            startRowIndex: 1, // Ab Zeile 2 (nach Header)
            endRowIndex: 1000, // Bis Zeile 1000 (für neue Artikel!)
            startColumnIndex: 2, // Spalte C (Main)
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: mainCategories.map(main => ({ userEnteredValue: main }))
            },
            showCustomUi: true, // Dropdown-Pfeil anzeigen
            strict: false // Erlaubt auch manuelle Eingabe (für neue Kategorien!)
          }
        }
      });
      
      // Sub-Kategorie Dropdown (Spalte D) - zeigt alle möglichen Subs
      // WICHTIG: Bis Zeile 1000, damit auch neue Zeilen Dropdowns haben!
      // Hinweis: Vollständig dynamische abhängige Dropdowns benötigen Apps Script
      // Für jetzt: Alle Subs anzeigen, aber manuelle Eingabe erlaubt
      const allSubs = Array.from(new Set(Object.values(categoryHierarchy).flat())).sort();
      validationRequests.push({
        setDataValidation: {
          range: {
            sheetId: artikelSheetId,
            startRowIndex: 1, // Ab Zeile 2 (nach Header)
            endRowIndex: 1000, // Bis Zeile 1000 (für neue Artikel!)
            startColumnIndex: 3, // Spalte D (Sub)
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: allSubs.map(sub => ({ userEnteredValue: sub }))
            },
            showCustomUi: true,
            strict: false // Erlaubt manuelle Eingabe für neue Subs
          }
        }
      });
      
      console.log(`✅ Dropdown-Validierungen erstellt (Main: ${mainCategories.length} Optionen, Sub: ${allSubs.length} Optionen)`);
      console.log(`   📋 Gilt für Zeilen 2-1000 (auch neue Artikel haben Dropdowns!)`);
      console.log('   ⚠️  Hinweis: Vollständig dynamische abhängige Dropdowns benötigen Apps Script.');
      console.log('   ✅ Manuelle Eingabe ist erlaubt (für neue Kategorien)');
    }

    // 10. Formatierung: Header einfrieren, Textumbruch und Spaltenbreite
    console.log('\n🎨 Formatiere Sheets...');
    
    const formatRequests: any[] = [];
    
    if (artikelSheetId !== undefined) {
      // Header einfrieren
      formatRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: artikelSheetId,
            gridProperties: {
              frozenRowCount: 1
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      });
      
      // Textumbruch für alle Zellen aktivieren (inkl. Header)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: artikelSheetId,
            startRowIndex: 0,
            endRowIndex: articleRows.length,
            startColumnIndex: 0,
            endColumnIndex: 11
          },
          cell: {
            userEnteredFormat: {
              wrapStrategy: 'WRAP',
              verticalAlignment: 'TOP'
            }
          },
          fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment'
        }
      });
      
      // Zeilenhöhe automatisch anpassen (damit umbrochener Text sichtbar ist)
      formatRequests.push({
        autoResizeDimensions: {
          dimensions: {
            sheetId: artikelSheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: articleRows.length
          }
        }
      });
      
      // Spaltenbreiten anpassen
      
      // Spalte A (Topic): 200px (wichtigstes Feld!)
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 1
          },
          properties: {
            pixelSize: 200
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte B (Text): 1200px (sehr breit für langen Text)
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 2
          },
          properties: {
            pixelSize: 1200
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalten C-D (Kategorien Main/Sub): 150px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 2,
            endIndex: 4
          },
          properties: {
            pixelSize: 150
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte E (ID): 200px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 4,
            endIndex: 5
          },
          properties: {
            pixelSize: 200
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte F (Keywords): 300px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 5,
            endIndex: 6
          },
          properties: {
            pixelSize: 300
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte G (Situations): 150px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 6,
            endIndex: 7
          },
          properties: {
            pixelSize: 150
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalten H-I (Importance, Difficulty): 100px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 7,
            endIndex: 9
          },
          properties: {
            pixelSize: 100
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte J (See Also): 300px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 9,
            endIndex: 10
          },
          properties: {
            pixelSize: 300
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte K (FAQ-Anzahl): 100px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: artikelSheetId,
            dimension: 'COLUMNS',
            startIndex: 10,
            endIndex: 11
          },
          properties: {
            pixelSize: 100
          },
          fields: 'pixelSize'
        }
      });
    }
    
    if (faqsSheetId !== undefined) {
      // Header einfrieren
      formatRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: faqsSheetId,
            gridProperties: {
              frozenRowCount: 1
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      });
      
      // Textumbruch für alle Zellen aktivieren (inkl. Header)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: faqsSheetId,
            startRowIndex: 0,
            endRowIndex: faqRows.length,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              wrapStrategy: 'WRAP',
              verticalAlignment: 'TOP'
            }
          },
          fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment'
        }
      });
      
      // Zeilenhöhe automatisch anpassen (damit umbrochener Text sichtbar ist)
      formatRequests.push({
        autoResizeDimensions: {
          dimensions: {
            sheetId: faqsSheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: faqRows.length
          }
        }
      });
      
      // Spaltenbreiten anpassen
      // Spalte A (FAQ-ID): 200px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: faqsSheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 1
          },
          properties: {
            pixelSize: 200
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte B (Artikel-ID): 150px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: faqsSheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 2
          },
          properties: {
            pixelSize: 150
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte C (Frage): 400px
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: faqsSheetId,
            dimension: 'COLUMNS',
            startIndex: 2,
            endIndex: 3
          },
          properties: {
            pixelSize: 400
          },
          fields: 'pixelSize'
        }
      });
      
      // Spalte D (Antwort): 800px (breiter für längere Antworten)
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: faqsSheetId,
            dimension: 'COLUMNS',
            startIndex: 3,
            endIndex: 4
          },
          properties: {
            pixelSize: 800
          },
          fields: 'pixelSize'
        }
      });
    }

    // Kombiniere Validation und Format Requests
    const allRequests = [...validationRequests, ...formatRequests];
    
    if (allRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: allRequests
        }
      });
      console.log('✅ Formatierung und Validierungen angewendet');
    }

    console.log('\n🎉 Export erfolgreich abgeschlossen!');
    console.log(`📊 Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
    console.log(`   - Sheet "Artikel": ${articleRows.length - 1} Zeilen`);
    console.log(`   - Sheet "FAQs": ${faqRows.length - 1} Zeilen`);

  } catch (error) {
    console.error('❌ Fehler beim Export:', error);
    if (error instanceof Error) {
      console.error('Fehlermeldung:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Script ausführen
exportToSpreadsheet()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

