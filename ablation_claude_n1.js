/**
 * N=1 Ablation: Claude on (A) live-fetched page text, (B) saved ground-truth, (C) structured/cleaned version.
 *
 * Goal: Compare latency + token usage + answer stability under three "content access" conditions.
 *
 * Notes:
 * - Claude cannot browse. "A" approximates real browsing by fetching the URL ourselves and passing extracted text.
 * - We cap context length uniformly to avoid runaway token costs and to keep conditions comparable.
 *
 * Run:
 *   cd /Users/remoprinz/Documents/Kigate
 *   node ablation_claude_n1.js
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import { performance } from 'perf_hooks';

dotenv.config({ path: '.env.local' });

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS_OUT = 900;
const TEMPERATURE = 0.1;

// Keep this small-ish to control cost; apply same cap to all conditions.
const CONTEXT_MAX_CHARS = 12000;

const GROUND_TRUTH_PATH =
  './content-optimizer/reports/ground-truth/ground-truth-mobiliar-hausrat.md';

// Single test question (n=1)
const QUESTION =
  'Ich habe meine Drohne vom Balkon aus fliegen lassen, dann war der Akku leer und die Drohne ist abgestürzt. ' +
  'Ich habe eine Kasko. Ist das bei der Mobiliar gedeckt und wie hoch ist der Selbstbehalt? ' +
  "Antworte nur basierend auf dem MATERIAL. Wenn es nicht im MATERIAL steht: 'Keine Angabe im Material'.";

function clampChars(s, maxChars) {
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + '\n\n[... gekürzt ...]';
}

function extractUrlFromGroundTruth(md) {
  const m = md.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/m);
  return m?.[1] ?? null;
}

function stripHtmlToText(html) {
  if (!html) return '';
  let s = html;
  // Remove scripts/styles first
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Add line breaks for common block-ish tags
  s = s.replace(/<\/(p|div|section|article|header|footer|main|li|ul|ol|h1|h2|h3|h4|h5|h6)>/gi, '\n');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  // Remove remaining tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode a few common entities
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  // Collapse whitespace
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function makeStructuredFromMarkdown(md) {
  // Minimal "LLM-friendly" structuring: remove obvious nav noise, images, collapse links, keep headings.
  const lines = md.split('\n');

  const cleaned = [];
  for (let line of lines) {
    // Drop image lines
    if (/^\s*!\[.*\]\(.+\)\s*$/.test(line)) continue;

    // Drop obvious in-page nav
    if (/^\s*\[Zum Inhalt\]/i.test(line)) continue;
    if (/^\s*\[In Kürze\]/i.test(line)) continue;

    // Normalize markdown links: [text](url) -> text (url)
    line = line.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)');
    // Normalize internal links: [text](/path) -> text (/path)
    line = line.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '$1 ($2)');

    cleaned.push(line);
  }

  let s = cleaned.join('\n');
  // Collapse multiple blank lines
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  // Extract "high-signal" snippets (helps answer under tight context caps)
  const KEYWORDS = [
    'Drohne',
    'Drohnen',
    'Kasko',
    'Hausratkasko',
    'Selbstbehalt',
    'CHF',
    'Grobe Fahrlässigkeit',
    'grobfahrlässig',
    'bis 26',
    'Junge',
    'Jugend',
  ];

  const snippetLines = [];
  for (const line of s.split('\n')) {
    const hit = KEYWORDS.some((k) => line.toLowerCase().includes(k.toLowerCase()));
    if (hit) snippetLines.push(line.trim());
  }

  const snippets = snippetLines
    .filter(Boolean)
    .slice(0, 80) // keep it bounded
    .map((l) => `- ${l}`)
    .join('\n');

  const structured =
    `MATERIAL (STRUKTURIERT / BEREINIGT)\n` +
    `================================\n\n` +
    `HIGH-SIGNAL EXTRAKTE (Keyword-basiert; keine neuen Fakten):\n` +
    (snippets ? snippets + '\n\n' : '- (keine Treffer)\n\n') +
    `---\n\n` +
    `VOLLTEXT (bereinigt):\n` +
    s;

  return structured;
}

async function runClaude({ label, material, extraMeta = {} }) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system =
    `Du bist ein Versicherungsexperte.\n` +
    `WICHTIG: Du darfst nur anhand des folgenden MATERIALS antworten.\n` +
    `Wenn eine Information nicht explizit im MATERIAL steht, antworte exakt: "Keine Angabe im Material".\n` +
    `Kein Raten, keine externen Quellen, keine Verallgemeinerungen.\n\n` +
    `--- MATERIAL START ---\n` +
    clampChars(material, CONTEXT_MAX_CHARS) +
    `\n--- MATERIAL ENDE ---\n`;

  const t0 = performance.now();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_OUT,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: 'user', content: QUESTION }],
  });
  const t1 = performance.now();

  const text = msg?.content?.[0]?.text ?? '';
  const usage = msg?.usage ?? {};

  return {
    label,
    model: MODEL,
    temperature: TEMPERATURE,
    wall_ms_llm: Math.round(t1 - t0),
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    material_chars: material?.length ?? 0,
    material_chars_capped: clampChars(material, CONTEXT_MAX_CHARS).length,
    answer: text.trim(),
    ...extraMeta,
  };
}

async function fetchLiveText(url) {
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // mimic a normal browser UA a bit
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'de-CH,de;q=0.9,en;q=0.8',
    },
  });
  const html = await res.text();
  const t1 = performance.now();

  const text = stripHtmlToText(html);
  return {
    ok: res.ok,
    status: res.status,
    fetch_ms: Math.round(t1 - t0),
    html_chars: html.length,
    text_chars: text.length,
    text,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Fehler: ANTHROPIC_API_KEY fehlt (erwartet in .env.local).');
    process.exit(1);
  }

  const md = fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8');
  const url = extractUrlFromGroundTruth(md);
  if (!url) {
    console.error('Fehler: Konnte URL nicht aus Ground-Truth extrahieren.');
    process.exit(1);
  }

  console.log('=== ABLATION N=1 (Claude) ===');
  console.log('Frage:', QUESTION);
  console.log('Ground Truth:', GROUND_TRUTH_PATH);
  console.log('URL:', url);
  console.log('Model:', MODEL, '| T=', TEMPERATURE);
  console.log('Context cap chars:', CONTEXT_MAX_CHARS);
  console.log('============================\n');

  // A) Live fetch → extracted text
  let live = null;
  try {
    live = await fetchLiveText(url);
  } catch (e) {
    live = { ok: false, status: null, fetch_ms: null, html_chars: null, text_chars: null, text: '' };
    console.log('WARN: Live fetch fehlgeschlagen:', e?.message ?? e);
  }

  const materialA =
    `QUELLE (LIVE): ${url}\n` +
    `FETCH_STATUS: ok=${live.ok} status=${live.status}\n\n` +
    `INHALT (aus HTML extrahiert):\n` +
    live.text;

  const resultA = await runClaude({
    label: 'A_live_fetch',
    material: materialA,
    extraMeta: {
      fetch_ms: live.fetch_ms,
      live_ok: live.ok,
      live_status: live.status,
      live_html_chars: live.html_chars,
      live_text_chars: live.text_chars,
    },
  });

  // B) Saved ground-truth markdown
  const resultB = await runClaude({
    label: 'B_saved_ground_truth',
    material: md,
  });

  // C) Structured/cleaned version of same ground-truth
  const structured = makeStructuredFromMarkdown(md);
  const resultC = await runClaude({
    label: 'C_structured',
    material: structured,
  });

  const results = [resultA, resultB, resultC];

  console.log('\n=== RESULTS (JSON) ===');
  console.log(JSON.stringify(results, null, 2));

  console.log('\n=== QUICK SUMMARY ===');
  for (const r of results) {
    console.log(
      `${r.label}: fetch_ms=${r.fetch_ms ?? '-'} llm_ms=${r.wall_ms_llm} ` +
        `inTok=${r.input_tokens ?? '-'} outTok=${r.output_tokens ?? '-'} ` +
        `chars(capped)=${r.material_chars_capped}`
    );
  }
}

main().catch((e) => {
  console.error('Fatal:', e?.stack ?? e);
  process.exit(1);
});




