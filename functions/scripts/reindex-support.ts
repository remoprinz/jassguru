/**
 * Re-Indexing Script for Jassguru Support Pinecone Index
 * Uses gemini-embedding-001 with 768 dimensions
 */
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables from jasswiki (shared keys)
dotenv.config({ path: '../../jasswiki/.env' });

const INDEX_NAME = 'jassguru-support';
const NAMESPACE = 'topics';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const BATCH_SIZE = 50;
const IMAGE_BASE_URL = 'https://jassguru.ch/support-images/';

interface SupportTopic {
  id: string;
  number: string;
  title: string;
  category: {
    main: string;
    mainId: string;
    number: number;
  };
  difficulty: string;
  priority: number;
  tags: string[];
  description: string;
  steps: Array<{ number: number; text: string; image?: string }>;
  images: string[];
  primaryImage: string;
  keywords: string[];
  synonyms: string[];
  userProblems: string[];
  seeAlso?: string[];
  faq?: Array<{ question: string; answer: string }>;
  nextSuggested?: string;
  nextSuggestedText?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildTextForEmbedding(topic: SupportTopic): string {
  const parts: string[] = [];
  
  // Title
  parts.push(`# ${topic.title}`);
  
  // Description
  if (topic.description) {
    parts.push(topic.description);
  }
  
  // Steps
  if (topic.steps && topic.steps.length > 0) {
    parts.push('\n## Schritte:');
    topic.steps.forEach((step, idx) => {
      parts.push(`${idx + 1}. ${step.text}`);
    });
  }
  
  // Keywords & Synonyms (for better semantic matching)
  if (topic.keywords && topic.keywords.length > 0) {
    parts.push(`\nKeywords: ${[...new Set(topic.keywords)].slice(0, 20).join(', ')}`);
  }
  
  if (topic.synonyms && topic.synonyms.length > 0) {
    parts.push(`Synonyme: ${[...new Set(topic.synonyms)].slice(0, 10).join(', ')}`);
  }
  
  // FAQ
  if (topic.faq && topic.faq.length > 0) {
    parts.push('\n## Häufige Fragen:');
    topic.faq.forEach(faq => {
      parts.push(`Q: ${faq.question}\nA: ${faq.answer}`);
    });
  }
  
  return parts.join('\n\n');
}

function buildFullTextForResponse(topic: SupportTopic): string {
  const parts: string[] = [];
  
  // Title
  parts.push(`# ${topic.title}`);
  
  // Description
  if (topic.description) {
    parts.push(topic.description);
  }
  
  // Steps with images
  if (topic.steps && topic.steps.length > 0) {
    parts.push('\n## Schritte:');
    topic.steps.forEach((step, idx) => {
      let stepText = `${idx + 1}. ${step.text}`;
      if (step.image) {
        const imageUrl = step.image.startsWith('http') ? step.image : `${IMAGE_BASE_URL}${step.image}`;
        stepText += `\n   ![Schritt ${idx + 1}](${imageUrl})`;
      }
      parts.push(stepText);
    });
  }
  
  // FAQ
  if (topic.faq && topic.faq.length > 0) {
    parts.push('\n## Häufige Fragen:');
    topic.faq.forEach(faq => {
      parts.push(`**Q:** ${faq.question}\n**A:** ${faq.answer}`);
    });
  }
  
  return parts.join('\n\n');
}

async function main() {
  console.log('🚀 Jassguru Support Re-Indexing mit gemini-embedding-001 (768D)');
  console.log('='.repeat(60));

  // Check API keys
  const pineconeKey = process.env.PINECONE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!pineconeKey || !geminiKey) {
    console.error('❌ API Keys fehlen! Setze PINECONE_API_KEY und GEMINI_API_KEY in .env');
    process.exit(1);
  }

  console.log(`✅ PINECONE_API_KEY: ${pineconeKey.substring(0, 15)}...`);
  console.log(`✅ GEMINI_API_KEY: ${geminiKey.substring(0, 15)}...`);

  // Initialize clients
  const pinecone = new Pinecone({ apiKey: pineconeKey });
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const index = pinecone.Index(INDEX_NAME);

  // Read support content
  const dataPath = '../src/data/support-content.json';
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const supportContent = JSON.parse(rawData) as Record<string, SupportTopic>;
  
  const topics = Object.values(supportContent);
  console.log(`📚 ${topics.length} Topics geladen`);

  // Delete existing vectors in namespace
  console.log(`🗑️  Lösche bestehende Vektoren in Namespace "${NAMESPACE}"...`);
  try {
    await index.namespace(NAMESPACE).deleteAll();
    console.log('✅ Namespace geleert');
  } catch (err) {
    console.log('⚠️  Namespace war leer oder konnte nicht gelöscht werden');
  }

  // Process in batches
  const vectors: any[] = [];
  let processed = 0;
  let errors = 0;

  for (const topic of topics) {
    try {
      // Create text for embedding
      const textToEmbed = buildTextForEmbedding(topic);
      const fullText = buildFullTextForResponse(topic);

      // Generate embedding with 768 dimensions
      const result = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: textToEmbed,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS
        }
      });

      const embedding = result.embeddings?.[0]?.values;
      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        console.error(`❌ Ungültige Embedding-Dimension für ${topic.id}`);
        errors++;
        continue;
      }

      // Collect all images from steps
      const allImages: string[] = [];
      if (topic.primaryImage) {
        const url = topic.primaryImage.startsWith('http') ? topic.primaryImage : `${IMAGE_BASE_URL}${topic.primaryImage}`;
        allImages.push(url);
      }
      topic.steps?.forEach(step => {
        if (step.image) {
          const url = step.image.startsWith('http') ? step.image : `${IMAGE_BASE_URL}${step.image}`;
          if (!allImages.includes(url)) {
            allImages.push(url);
          }
        }
      });

      vectors.push({
        id: `topic_${topic.id}`,
        values: embedding,
        metadata: {
          source: topic.title,
          title: topic.title,
          text: fullText,
          category_main: topic.category?.main || 'Allgemein',
          category_sub: '',
          number: topic.number || '',
          difficulty: topic.difficulty || 'einfach',
          priority: topic.priority || 3,
          images: allImages.join(','),
          see_also: topic.seeAlso || [],
          next_suggested: topic.nextSuggested || '',  // Pinecone erlaubt kein null
          next_suggested_text: topic.nextSuggestedText || '',  // Pinecone erlaubt kein null
          content_type: 'support_topic',
          language: 'de'
        }
      });

      processed++;
      process.stdout.write(`\r📊 Verarbeitet: ${processed}/${topics.length} (${errors} Fehler)`);

      // Rate limiting - 1 request per 100ms to stay under 600/min
      await sleep(100);

      // Upsert in batches
      if (vectors.length >= BATCH_SIZE) {
        await index.namespace(NAMESPACE).upsert(vectors);
        console.log(`\n☁️  ${vectors.length} Vektoren hochgeladen`);
        vectors.length = 0;
      }

    } catch (err: any) {
      console.error(`\n❌ Fehler bei ${topic.id}: ${err.message}`);
      errors++;
      await sleep(1000); // Wait longer on error
    }
  }

  // Upsert remaining vectors
  if (vectors.length > 0) {
    await index.namespace(NAMESPACE).upsert(vectors);
    console.log(`\n☁️  ${vectors.length} verbleibende Vektoren hochgeladen`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Re-Indexing abgeschlossen!`);
  console.log(`📊 Erfolgreich: ${processed - errors}/${topics.length}`);
  console.log(`❌ Fehler: ${errors}`);
  console.log(`🔗 Index: ${INDEX_NAME}, Namespace: ${NAMESPACE}`);
}

main().catch(console.error);
