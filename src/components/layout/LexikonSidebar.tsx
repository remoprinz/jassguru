import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import allContent from '@/data/jass-content-v2.json';
import { JassContentRecord, JassContentItem } from '@/types/jass-lexikon';
import { toSlug } from '@/lib/utils';

// Funktion zur schönen Formatierung von Topic-Namen
const formatTopicName = (name: string): string => {
  return name
    .replace(/ACHTBLATT/g, 'Achtblatt')
    .replace(/NEUNBLATT/g, 'Neunblatt')
    .replace(/DREIBLATT/g, 'Dreiblatt')
    .replace(/VIERBLATT/g, 'Vierblatt')
    .replace(/FUENFBLATT/g, 'Fünfblatt')
    .replace(/SECHSBLATT/g, 'Sechsblatt')
    .replace(/SIEBENBLATT/g, 'Siebenblatt')
    .replace(/VIER_GLEICHE/g, 'Vier gleiche')
    .replace(/GRUNDREGELN/g, 'Grundregeln')
    .replace(/REIHENFOLGE/g, 'Reihenfolge')
    .replace(/SCHNEIDER/g, 'Schneider')
    .replace(/KORREKTUREN/g, 'Korrekturen')
    .replace(/ZAHLENDARSTELLUNG/g, 'Zahlendarstellung')
    .replace(/FRUEHZEITIGES_BEDANKEN/g, 'Frühzeitiges Bedanken')
    .replace(/BEDANKEN/g, 'Bedanken')
    .replace(/STOECK/g, 'Stöck');
};

// Helper to build the navigation structure (3-level)
const getNavigationStructure = (content: JassContentRecord) => {
  const structure: Record<string, {
    name: string;
    subcategories: Record<string, {
      name: string;
      slug: string;
      topics: { name: string; slug: string }[];
    }>;
  }> = {};

  (Object.values(content) as JassContentItem[]).forEach(item => {
    const mainCatSlug = toSlug(item.metadata.category.main);
    const subCatSlug = toSlug(item.metadata.category.sub);
    const topicSlug = toSlug(item.metadata.category.topic);

    if (!structure[mainCatSlug]) {
      structure[mainCatSlug] = {
        name: item.metadata.category.main,
        subcategories: {}
      };
    }

    if (!structure[mainCatSlug].subcategories[subCatSlug]) {
      structure[mainCatSlug].subcategories[subCatSlug] = {
        name: item.metadata.category.sub,
        slug: subCatSlug,
        topics: []
      };
    }

    // Avoid duplicate topics
    if (!structure[mainCatSlug].subcategories[subCatSlug].topics.some(t => t.slug === topicSlug)) {
      structure[mainCatSlug].subcategories[subCatSlug].topics.push({
        name: item.metadata.category.topic,
        slug: topicSlug
      });
    }
  });

  // Sort topics logically instead of alphabetically
  Object.keys(structure).forEach(catSlug => {
    const cat = structure[catSlug];

    // Sortiere Subcategories alphabetisch
    const sortedSubcats = Object.keys(cat.subcategories).sort().reduce<Record<string, {
      name: string;
      slug: string;
      topics: { name: string; slug: string }[];
    }>>((result, subCatSlug) => {
      result[subCatSlug] = cat.subcategories[subCatSlug];
      return result;
    }, {});

    cat.subcategories = sortedSubcats;

    // Für jede Subcategory: spezielle Sortierung wenn nötig
    Object.keys(cat.subcategories).forEach(subCatSlug => {
      const subcat = cat.subcategories[subCatSlug];

      // Spezielle Sortierung für Weis-Regeln
      if (catSlug === 'weis-regeln') {
        // Definiere die logische Reihenfolge für Weis-Arten
        const weisOrder = [
          'Grundregeln',
          'Dreiblatt',
          'Vierblatt',
          'Fünfblatt',
          'Sechsblatt',
          'Siebenblatt',
          'Achtblatt',
          'Neunblatt',
          'Vier gleiche',
          'Stöck',
          'Reihenfolge',
          'Schneider',
          'Korrekturen',
          'Zahlendarstellung',
          'Frühzeitiges Bedanken',
          'Bedanken'
        ];

        subcat.topics.sort((a, b) => {
          // Normalisiere die Namen für Vergleich
          const normalizeWeisName = (name: string) => {
            return name
              .replace(/BLATT/g, 'blatt')
              .replace(/VIER_GLEICHE/g, 'Vier gleiche')
              .replace(/FUENFBLATT/g, 'Fünfblatt')
              .replace(/SECHSBLATT/g, 'Sechsblatt')
              .replace(/SIEBENBLATT/g, 'Siebenblatt')
              .replace(/ACHTBLATT/g, 'Achtblatt')
              .replace(/NEUNBLATT/g, 'Neunblatt')
              .replace(/DREIBLATT/g, 'Dreiblatt')
              .replace(/VIERBLATT/g, 'Vierblatt')
              .replace(/Zahlendarstellung/g, 'Zahlendarstellung');
          };

          const normalizedA = normalizeWeisName(a.name);
          const normalizedB = normalizeWeisName(b.name);

          const indexA = weisOrder.findIndex(item => normalizedA.toLowerCase().includes(item.toLowerCase()));
          const indexB = weisOrder.findIndex(item => normalizedB.toLowerCase().includes(item.toLowerCase()));

          // Wenn beide in der Liste sind, nach Index sortieren
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }
          // Wenn nur einer in der Liste ist, den in der Liste zuerst
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          // Sonst alphabetisch
          return a.name.localeCompare(b.name);
        });
      } else {
        // Für andere Kategorien: alphabetische Sortierung
        subcat.topics.sort((a, b) => a.name.localeCompare(b.name));
      }
    });
  });

  return structure;
};


export const LexikonSidebar = () => {
  const router = useRouter();
  const { category: currentCategory, subcategory: currentSubcategory, topic: currentTopic } = router.query;

  const navigationStructure = useMemo(() => getNavigationStructure(allContent as JassContentRecord), []);

  return (
    <div>
      <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white border-b border-gray-600 pb-2">Jass-Wissen</h3>
      <nav>
        <ul className="space-y-2">
          {Object.entries(navigationStructure).map(([catSlug, categoryData]) => {
            const isCategoryActive = catSlug === currentCategory;
            return (
              <li key={catSlug}>
                <div className="flex items-center justify-between">
                  <Link href={`/wissen/${catSlug}`} legacyBehavior>
                    <a className={`font-semibold text-base sm:text-lg transition-colors ${isCategoryActive ? 'text-green-400' : 'text-gray-300 hover:text-green-400'}`}>
                      {categoryData.name}
                    </a>
                  </Link>
                  {/* We can add an accordion-style toggle here later */}
                </div>
                {isCategoryActive && (
                  <ul className="ml-3 sm:ml-4 mt-1 sm:mt-2 space-y-1">
                    {Object.entries(categoryData.subcategories).map(([subCatSlug, subcategoryData]) => {
                      const isSubcategoryActive = subCatSlug === currentSubcategory;
                      return (
                        <li key={subCatSlug}>
                          <div className="mb-1">
                            <Link href={`/wissen/${catSlug}/${subCatSlug}`} legacyBehavior>
                              <a className={`block font-medium text-sm sm:text-base transition-colors ${isSubcategoryActive ? 'text-green-400' : 'text-gray-300 hover:text-green-400'}`}>
                                {subcategoryData.name}
                              </a>
                            </Link>
                            {isSubcategoryActive && (
                              <ul className="ml-3 sm:ml-4 mt-1 border-l border-green-500 pl-3 sm:pl-4 space-y-1">
                                {subcategoryData.topics.map(topic => {
                                  const isTopicActive = topic.slug === currentTopic;
                                  return (
                                    <li key={topic.slug}>
                                      <Link href={`/wissen/${catSlug}/${subCatSlug}/${topic.slug}`} legacyBehavior>
                                        <a className={`block text-sm sm:text-base transition-colors ${isTopicActive ? 'text-green-400 font-semibold' : 'text-gray-400 hover:text-green-300 hover:underline'}`}>
                                          {formatTopicName(topic.name)}
                                        </a>
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}; 