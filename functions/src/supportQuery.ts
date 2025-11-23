/**
 * Firebase Function für Jassguru Support RAG API
 * 
 * Endpoint: POST /support
 * 
 * Diese Function ermöglicht ChatGPT, Support-Artikel aus Pinecone abzurufen.
 * Sie nutzt den Index 'jassguru-support' mit Namespace 'topics'.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Define secrets
const pineconeApiKey = defineSecret('PINECONE_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// ============================================================================
// CONFIGURATION
// ============================================================================

const INDEX_NAME = 'jassguru-support';
const NAMESPACE = 'topics';
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.70;
const MARGIN_THRESHOLD = 0.01;
const EMBEDDING_MODEL = 'embedding-001';
const IMAGE_BASE_URL = 'https://jassguru.ch/support-images/';

// ============================================================================
// TYPES
// ============================================================================

interface SupportQueryRequest {
  query: string;
  topK?: number;
  filters?: {
    category?: string;
    minScore?: number;
  };
}

interface SupportQueryResult {
  id: string;
  text: string;
  score: number;
  title: string;
  category: {
    main: string;
    sub: string;
  };
  see_also: string[];
  // images & primaryImage entfernt, damit ChatGPT nicht doppelt rendert
  images?: string[];
  primaryImage?: string | null;
  number: string;
  difficulty: string;
  priority: number;
  nextSuggested: string | null;
  nextSuggestedText: string | null;
}

interface SupportQueryResponse {
  results: SupportQueryResult[];
  metadata: {
    query: string;
    topK: number;
    threshold: number;
    margin: number;
    total_matches: number;
    filtered_count: number;
    rejectedReason?: string | null;
  };
}

// ============================================================================
// SERVICES (Lazy Init)
// ============================================================================

let pineconeClient: Pinecone | null = null;
let embeddingModel: any = null;

function initializePinecone(apiKey: string): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

function initializeEmbedding(apiKey: string): any {
  if (!embeddingModel) {
    const genAI = new GoogleGenerativeAI(apiKey);
    embeddingModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  }
  return embeddingModel;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function generateEmbedding(text: string, model: any): Promise<number[]> {
  const result = await model.embedContent(text.trim().toLowerCase());
  return result.embedding.values;
}

function normalizeQuery(query: string): string[] {
  const variants = new Set<string>();
  
  // 1. Original (unverändert)
  variants.add(query.trim());
  
  // 2. Kleinbuchstaben
  const lower = query.toLowerCase().trim();
  variants.add(lower);
  
  // 3. Stop-Words entfernen (wie im Frontend)
  const stopWords = /\b(wie|wo|wann|warum|was|wer|ich|du|er|sie|es|wir|ihr|sie|ist|sind|war|waren|kann|können|muss|müssen|soll|sollen|der|die|das|ein|eine|einer|eines|und|oder|aber|zu|auf|in|im|mit|von|für|an|bei)\b/g;
  const cleaned = lower.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > 0) {
    variants.add(cleaned);
  }
  
  return Array.from(variants).filter(v => v.length > 0).slice(0, 3);
}

function applyMarginFilter(
  matches: any[],
  minScore: number,
  margin: number
): { filtered: any[]; rejectedReason?: string } {
  // Schritt 1: Filter nach minScore
  const aboveThreshold = matches.filter(m => m.score >= minScore);

  if (aboveThreshold.length === 0) {
    return {
      filtered: [],
      rejectedReason: `Keine Treffer über Schwellwert (${minScore})`,
    };
  }

  // Schritt 2: Check Margin zwischen Top-Treffer und Rest
  const topScore = aboveThreshold[0].score;
  const secondScore = aboveThreshold[1]?.score || 0;

  if (topScore - secondScore < margin && aboveThreshold.length > 1) {
    console.log(`⚠️  Geringe Margin (${(topScore - secondScore).toFixed(3)}), verwende Top-Result`);
    return { filtered: [aboveThreshold[0]] };
  }

  return { filtered: aboveThreshold };
}

/**
 * Formatiert den Text aus Pinecone für ChatGPT
 * Entfernt Keywords, die ChatGPT verwirren könnten
 * Fügt Bilder als Markdown am Ende hinzu
 */
function formatTextForChatGPT(metadata: any): string {
  // Der Text sollte bereits im 'text' Feld sein (aus ingest-to-pinecone.ts)
  let text = metadata.text || '';
  const imageUrls = formatImageUrls(metadata.images);
  
  // Falls Text nicht vorhanden (sollte nicht passieren), baue Text aus Feldern
  if (!text || text.trim().length === 0) {
    const parts: string[] = [];
    
    if (metadata.title) {
      parts.push(`# ${metadata.title}`);
    }
    
    if (metadata.description) {
      parts.push(metadata.description);
    }
    
    if (metadata.steps) {
      parts.push('\n## Schritte:');
      const steps = typeof metadata.steps === 'string' 
        ? metadata.steps.split('|').filter((s: string) => s.trim())
        : Array.isArray(metadata.steps) ? metadata.steps : [];
      
      steps.forEach((step: string, idx: number) => {
        parts.push(`${idx + 1}. ${step.trim()}`);
      });
    }
    
    if (metadata.faq) {
      parts.push('\n## Häufige Fragen:');
      const faqs = typeof metadata.faq === 'string'
        ? metadata.faq.split('||').filter((f: string) => f.trim())
        : Array.isArray(metadata.faq) ? metadata.faq : [];
      
      faqs.forEach((faq: string) => {
        const [q, a] = faq.split('|').map(s => s.trim());
        if (q && a) {
          parts.push(`**Q:** ${q}\n**A:** ${a}`);
        }
      });
    }
    
    text = parts.join('\n\n');
  }

  // BILDER EINBETTEN (Am Ende des Textes)
  // WICHTIG: Mit Text zwischen Bildern trennen, damit ChatGPT sie NICHT als Galerie nebeneinander anzeigt
  if (imageUrls.length > 0) {
    text += '\n\n## 📸 Ansichten:\n';
    imageUrls.forEach((url, index) => {
      // Extrahiere Dateinamen für Alt-Text (z.B. "03_spiel_starten.png" -> "Spiel starten")
      const filename = url.split('/').pop() || 'Bild';
      const altText = filename.replace(/^\d+[-_]/, '').replace(/[-_]/g, ' ').replace(/\.[^/.]+$/, '');
      
      // Wenn mehr als 1 Bild: Mit Text trennen, damit sie NICHT nebeneinander als Galerie erscheinen
      if (index > 0) {
        text += '\n\n---\n\n'; // Horizontale Linie als Trenner
      }
      
      text += `\n![${altText}](${url})\n`;
    });
  }
  
  return text;
}

/**
 * Formatiert Bild-URLs zu absoluten URLs
 */
function formatImageUrls(images: string | string[] | undefined): string[] {
  if (!images) return [];
  
  const imageArray = typeof images === 'string' 
    ? images.split(',').filter(img => img.trim())
    : Array.isArray(images) ? images : [];
  
  return imageArray.map(img => {
    const trimmed = img.trim();
    if (trimmed.startsWith('http')) {
      return trimmed;
    }
    return `${IMAGE_BASE_URL}${trimmed}`;
  });
}

// ============================================================================
// MAIN QUERY FUNCTION
// ============================================================================

export const supportQuery = onRequest(
  {
    cors: true,
    secrets: [pineconeApiKey, geminiApiKey],
    memory: '512MiB',
    timeoutSeconds: 60,
    region: 'us-central1',
  },
  async (req, res) => {
    // CORS Headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { query, topK = DEFAULT_TOP_K, filters } = req.body as SupportQueryRequest || {};

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Query darf nicht leer sein' });
      return;
    }

    console.log(`🔍 Support Query: "${query}"`);
    console.log(`   TopK: ${topK}, MinScore: ${filters?.minScore || DEFAULT_MIN_SCORE}`);

    try {
      // Initialize Services with Secrets
      let pineconeKey: string;
      let geminiKeyValue: string;
      
      try {
        pineconeKey = pineconeApiKey.value();
        geminiKeyValue = geminiApiKey.value();
        console.log(`🔑 Secrets geladen: PINECONE=${pineconeKey?.substring(0, 10)}..., GEMINI=${geminiKeyValue?.substring(0, 10)}...`);
      } catch (secretError: any) {
        console.error('❌ Secret-Ladefehler:', secretError);
        res.status(500).json({
          error: 'Secret-Ladefehler',
          message: secretError.message || 'Secrets konnten nicht geladen werden'
        });
        return;
      }
      
      if (!geminiKeyValue || geminiKeyValue.length === 0) {
        console.error('❌ GEMINI_API_KEY ist leer oder undefined');
        res.status(500).json({
          error: 'GEMINI_API_KEY fehlt',
          message: 'Gemini API Key wurde nicht geladen'
        });
        return;
      }
      
      const pinecone = initializePinecone(pineconeKey);
      const embeddingService = initializeEmbedding(geminiKeyValue);
      
      // 1. Query-Normalisierung
      const index = pinecone.index(INDEX_NAME);
      const queryVariants = normalizeQuery(query);
      console.log(`🧠 Query-Varianten: ${queryVariants.map(q => '"' + q + '"').join(' | ')}`);

      // 2. Embeddings generieren
      const queryEmbeddings = await Promise.all(
        queryVariants.map(q => generateEmbedding(q, embeddingService))
      );
      console.log(`✅ Embeddings generiert: ${queryEmbeddings.length}× (768D)`);

      // 3. Pinecone Query (Namespace: topics)
      const namespaceQueries = queryEmbeddings.map(vector =>
        index.namespace(NAMESPACE).query({
          vector,
          topK: topK * 2,
          includeMetadata: true,
        })
      );

      const namespaceResults = await Promise.all(namespaceQueries);

      // 4. Kombiniere Ergebnisse
      const allMatches: any[] = [];
      for (const result of namespaceResults) {
        const matches = result?.matches || [];
        for (const match of matches) {
          allMatches.push(match);
        }
      }
      
      // Entferne Duplikate (gleiche ID)
      const uniqueMatches = new Map<string, any>();
      for (const match of allMatches) {
        const id = match.id || '';
        if (!uniqueMatches.has(id) || (match.score || 0) > (uniqueMatches.get(id)?.score || 0)) {
          uniqueMatches.set(id, match);
        }
      }
      
      const deduplicatedMatches = Array.from(uniqueMatches.values());
      deduplicatedMatches.sort((a, b) => (b.score || 0) - (a.score || 0));

      console.log(`📊 Pinecone Matches: ${deduplicatedMatches.length}`);

      // 5. Scoring Policy anwenden
      const minScore = filters?.minScore || DEFAULT_MIN_SCORE;
      const { filtered, rejectedReason } = applyMarginFilter(
        deduplicatedMatches,
        minScore,
        MARGIN_THRESHOLD
      );

      console.log(`✅ Nach Filtering: ${filtered.length} Treffer`);

      // 6. Optional: Category-Filter
      let finalResults = filtered;
      if (filters?.category) {
        const beforeCount = finalResults.length;
        finalResults = filtered.filter(
          m => m.metadata?.category_main === filters.category
        );
        console.log(`   Category-Filter (${filters.category}): ${beforeCount} → ${finalResults.length}`);
        
        // FALLBACK: Wenn nach Category-Filter nichts gefunden → ohne Filter weitermachen
        if (finalResults.length === 0) {
          console.log(`⚠️  Category-Filter zu strikt → Fallback ohne Category-Filter`);
          finalResults = filtered;
        }
      }

      // 7. Top-Result auswählen (nur 1 Result für ChatGPT)
      const topResult = finalResults[0];

      // WICHTIG: NIEMALS 404 zurückgeben, sonst sieht ChatGPT "Verbindungsfehler"
      if (!topResult) {
        console.log(`⚠️  Keine Treffer gefunden für Query: "${query}"`);
        
        res.status(200).json({
          results: [],
          metadata: {
            query,
            topK: 1,
            threshold: minScore,
            margin: MARGIN_THRESHOLD,
            total_matches: deduplicatedMatches.length,
            filtered_count: filtered.length,
            rejectedReason: rejectedReason || `Kein passender Artikel zu "${query}" gefunden.`,
          }
        });
        return;
      }

      // 8. Response bauen
      const metadata = topResult.metadata || {};
      const formattedText = formatTextForChatGPT(metadata);

      const result: SupportQueryResult = {
        id: topResult.id || '',
        text: formattedText,
        score: topResult.score || 0,
        title: metadata.title || metadata.source || '',
        category: {
          main: metadata.category_main || '',
          sub: metadata.category_sub || '',
        },
        see_also: Array.isArray(metadata.see_also) 
          ? metadata.see_also 
          : typeof metadata.see_also === 'string' 
            ? metadata.see_also.split(',').filter((id: string) => id.trim())
            : [],
        // images: imageUrls, // DEAKTIVIERT: Bilder sind bereits im Text eingebettet
        // primaryImage: primaryImageUrl, // DEAKTIVIERT: Verhindert doppelte Anzeige
        number: metadata.number || '',
        difficulty: metadata.difficulty || 'einfach',
        priority: metadata.priority || 3,
        nextSuggested: metadata.next_suggested || null,
        nextSuggestedText: metadata.next_suggested_text || null,
      };

      const response: SupportQueryResponse = {
        results: [result],
        metadata: {
          query,
          topK: 1,
          threshold: minScore,
          margin: MARGIN_THRESHOLD,
          total_matches: deduplicatedMatches.length,
          filtered_count: filtered.length,
          rejectedReason,
        },
      };

      console.log(`✅ Response: Top-Result mit Score ${result.score.toFixed(3)} (${result.id})`);
      res.status(200).json(response);
    } catch (error: any) {
      console.error('❌ Fehler bei Support Query:', error);
      res.status(500).json({
        error: 'Query fehlgeschlagen',
        message: error.message || 'Internal server error'
      });
    }
  }
);

