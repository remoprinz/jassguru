const KEYWORD_GROUPS: string[][] = [
  ['rose', 'rosen', 'rosae', 'rösli'],
  ['schelle', 'schellen', 'schälle', 'schälla', 'schellä', 'schaelle'],
  ['schilte', 'schilten', 'schiltä', 'schilta'],
  ['eichel', 'eicheln', 'eichle', 'äichle', 'aeichle'],
  ['ecken', 'ecke', 'egge', 'ägge', 'eggen', 'äggen'],
  ['herz', 'herzen', 'härz', 'haerz'],
  ['kreuz', 'kreuzen', 'chruez', 'chrüüz', 'chrüz', 'kruuz'],
  ['schaufel', 'schaufeln', 'schaufle', 'schufle', 'schuufle'],
  ['trumpf', 'trümpf', 'trumpfen', 'trümpfen'],
  ['weis', 'wys', 'weise', 'weiss', 'weiß'],
  ['stöck', 'stoeck', 'stock', 'stöckli', 'stoeckli'],
  ['stich', 'stiche', 'stichli'],
  ['obenabe', 'obenab', 'obe nabe', 'oben abe'],
  ['undenufe', 'undenuf', 'unde nufe', 'unden uf'],
];

const MANUAL_EQUIVALENT_MAP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();

  const register = (term: string, equivalents: string[]) => {
    const normalized = normalize(term);
    if (!normalized) return;
    const set = map.get(normalized) ?? new Set<string>();
    for (const eq of equivalents) {
      const eqNorm = normalize(eq);
      if (eqNorm) {
        set.add(eqNorm);
      }
    }
    map.set(normalized, set);
  };

  for (const group of KEYWORD_GROUPS) {
    const normalizedGroup = group
      .map(normalize)
      .filter(Boolean) as string[];

    for (const term of normalizedGroup) {
      register(
        term,
        normalizedGroup.filter(other => other !== term)
      );
    }
  }

  const manualPairs: Array<[string, string[]]> = [
    ['schelle', ['schelen', 'schella']],
    ['schälle', ['schelle']],
    ['rosen', ['rose']],
    ['rose', ['rosen']],
    ['eichel', ['eichelä']],
    ['trumpf', ['trumpfen']],
  ];

  for (const [term, equivalents] of manualPairs) {
    register(term, equivalents);
  }

  return map;
})();

function normalize(input: string | undefined | null): string {
  if (!input) return '';
  return input.toLowerCase().trim();
}

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function addPluralVariants(base: string, target: Set<string>): void {
  if (base.length <= 2) return;

  if (base.endsWith('e')) {
    target.add(`${base}n`);
  }

  if (!base.endsWith('en')) {
    target.add(`${base}en`);
  }

  if (!base.endsWith('s')) {
    target.add(`${base}s`);
  }

  if (base.endsWith('n')) {
    target.add(base.slice(0, -1));
  }

  if (base.endsWith('en')) {
    target.add(base.slice(0, -2));
  }
}

function addDiacriticVariants(base: string, target: Set<string>): void {
  const umlautToPairs: Array<[RegExp, string]> = [
    [/ä/g, 'ae'],
    [/ö/g, 'oe'],
    [/ü/g, 'ue'],
  ];

  const pairsToUmlaut: Array<[RegExp, string]> = [
    [/ae/g, 'ä'],
    [/oe/g, 'ö'],
    [/ue/g, 'ü'],
  ];

  let currentVariants = new Set<string>([base]);

  for (const [regex, replacement] of umlautToPairs) {
    for (const variant of Array.from(currentVariants)) {
      if (regex.test(variant)) {
        currentVariants.add(variant.replace(regex, replacement));
      }
    }
  }

  for (const [regex, replacement] of pairsToUmlaut) {
    for (const variant of Array.from(currentVariants)) {
      if (regex.test(variant)) {
        currentVariants.add(variant.replace(regex, replacement));
      }
    }
  }

  for (const variant of Array.from(currentVariants)) {
    target.add(variant.replace(/ä/g, 'e').replace(/ö/g, 'e').replace(/ü/g, 'e'));
    target.add(variant.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'));
    target.add(variant.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
  }

  for (const variant of Array.from(currentVariants)) {
    target.add(variant);
  }
}

function expandSingleKeyword(keyword: string): Set<string> {
  const variants = new Set<string>();
  const base = normalize(keyword);
  if (!base) {
    return variants;
  }

  variants.add(base);

  const stripped = stripDiacritics(base);
  variants.add(stripped);

  MANUAL_EQUIVALENT_MAP.get(base)?.forEach(eq => variants.add(eq));
  MANUAL_EQUIVALENT_MAP.get(stripped)?.forEach(eq => variants.add(eq));

  addPluralVariants(base, variants);
  addPluralVariants(stripped, variants);
  addDiacriticVariants(base, variants);
  addDiacriticVariants(stripped, variants);

  if (base.includes('-')) {
    variants.add(base.replace(/-/g, ' '));
  }

  // Zweite Runde, damit neue Varianten ebenfalls Plural & Diakritik-Varianten erhalten
  for (const variant of Array.from(variants)) {
    MANUAL_EQUIVALENT_MAP.get(variant)?.forEach(eq => variants.add(eq));
    addPluralVariants(variant, variants);
    addDiacriticVariants(variant, variants);
  }

  const sanitized = new Set<string>();
  for (const variant of variants) {
    const clean = normalize(variant);
    if (!clean) continue;
    if (clean.length <= 1) continue;
    sanitized.add(clean);
  }

  return sanitized;
}

export function expandKeywords(baseKeywords: string[]): string[] {
  const expanded = new Set<string>();

  for (const keyword of baseKeywords) {
    const variants = expandSingleKeyword(keyword);
    for (const variant of variants) {
      expanded.add(variant);
    }
  }

  return Array.from(expanded).sort();
}

export function buildEmbeddingText(content: string, keywords: string[]): string {
  if (!keywords.length) {
    return content;
  }

  const uniqueKeywords = Array.from(new Set(keywords));
  return `${content}\n\nSchlagworte: ${uniqueKeywords.join(', ')}`;
}

