import React from 'react';
import { NextPage } from 'next';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import { SeoHead } from '@/components/layout/SeoHead';
import { Book, ExternalLink, Users, FileText, Globe } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

const QuellenPage: NextPage = () => {
  const breadcrumbItems = [
    { name: 'Jass-Wiki', href: '/wissen' },
    { name: 'Quellen', href: '/quellen' },
  ];

  // Scrolling für diese Seite aktivieren, genau wie bei allen anderen Wissensseiten
  useEffect(() => {
    document.body.classList.add('lexikon-page');
    return () => {
      document.body.classList.remove('lexikon-page');
    };
  }, []);

  return (
      <LexikonLayout breadcrumbItems={breadcrumbItems}>
        <SeoHead
          title="Quellen & Literatur | Das Schweizer Jass-Wiki"
          description="Alle Quellen und wissenschaftlichen Grundlagen für das Jass-Wiki. Fundiert, transparent und nachvollziehbar."
        />
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
              <Book className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Quellen & Literatur
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Unser Jass-Wiki basiert auf fundierten Quellen und wurde sorgfältig recherchiert. 
              Transparenz und Nachvollziehbarkeit sind uns wichtig.
            </p>
          </div>

          {/* Hauptquellen */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Book className="w-6 h-6 mr-3 text-green-400" />
              Hauptliteratur
            </h2>
            
            <div className="space-y-6">
              {/* STÖCK WYS STICH */}
              <div className="border-l-4 border-green-500 pl-6 py-2">
                <h3 className="text-xl font-bold text-white mb-2">
                  STÖCK WYS STICH – Der neue Schweizer Jassführer
                </h3>
                <div className="text-gray-300 space-y-1">
                  <p><strong>Autor:</strong> Dani Müller</p>
                  <p><strong>Verlag:</strong> Eigenverlag</p>
                  <p><strong>Erscheinungsjahr:</strong> 2016</p>
                  <p><strong>ISBN:</strong> 978-3-033-05548-8</p>
                  <p className="mt-3 text-gray-400 italic">
                    Das Standardwerk zum Schweizer Jass. Umfasst alle Regeln, Varianten und taktischen Feinheiten. 
                    Basis für den Großteil unserer Artikel über Jass-Varianten und Begriffe.
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    📊 Verwendet in 86 Artikeln
                  </p>
                </div>
              </div>

              {/* Offizielles Jassreglement */}
              <div className="border-l-4 border-blue-500 pl-6 py-2">
                <h3 className="text-xl font-bold text-white mb-2">
                  Offizielles Schweizer Jassreglement
                </h3>
                <div className="text-gray-300 space-y-1">
                  <p><strong>Herausgeber:</strong> Schweizer Jassverband</p>
                  <p><strong>Ausgabe:</strong> Aktuelle offizielle Fassung</p>
                  <p className="mt-3 text-gray-400 italic">
                    Die verbindliche Regelgrundlage für offizielles Turnier-Jassen in der Schweiz. 
                    Definiert Standardregeln, Weis-Wertungen und Spielabläufe.
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    📊 Verwendet in 71 Artikeln
                  </p>
                </div>
              </div>

              {/* Jassbuch */}
              <div className="border-l-4 border-purple-500 pl-6 py-2">
                <h3 className="text-xl font-bold text-white mb-2">
                  Das Jassbuch – Strategie und Taktik
                </h3>
                <div className="text-gray-300 space-y-1">
                  <p><strong>Verlag:</strong> AT Verlag</p>
                  <p className="mt-3 text-gray-400 italic">
                    Umfassendes Werk zu Jass-Strategien und taktischen Überlegungen. 
                    Besonders wertvoll für Schieber-Konventionen und Spielzüge.
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    📊 Verwendet in 28 Artikeln
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Weitere Quellen */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <FileText className="w-6 h-6 mr-3 text-green-400" />
              Weitere Quellen & Experten
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Kulturgeschichte */}
              <div className="bg-gray-900 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-white mb-3">
                  Kulturgeschichte des Jass
                </h3>
                <p className="text-gray-300 text-sm mb-2">
                  <strong>Quelle:</strong> Erika Lüscher in STÖCK WYS STICH
                </p>
                <p className="text-gray-400 text-sm">
                  Historische Einordnung und kulturelle Bedeutung des Jass in der Schweiz.
                </p>
              </div>

              {/* Spielkartenmuseum */}
              <div className="bg-gray-900 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-white mb-3">
                  Schweizer Spielkartenmuseum
                </h3>
                <p className="text-gray-300 text-sm mb-2">
                  <strong>Ort:</strong> Basel, Schweiz
                </p>
                <p className="text-gray-400 text-sm">
                  Historische Informationen zu Kartenherstellung und regionalen Varianten.
                </p>
              </div>

              {/* Expertenwissen */}
              <div className="bg-gray-900 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-green-400" />
                  Jassguru Expertenwissen
                </h3>
                <p className="text-gray-400 text-sm">
                  Eigene Analysen und Zusammenfassungen basierend auf langjähriger Jass-Erfahrung 
                  und Community-Feedback.
                </p>
              </div>

              {/* Europäische Verbände */}
              <div className="bg-gray-900 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-blue-400" />
                  Europäische Spielkartenverbände
                </h3>
                <p className="text-gray-400 text-sm">
                  Internationale Perspektiven und historische Kontextualisierung des Jass 
                  im europäischen Kartenspiel.
                </p>
              </div>
            </div>
          </div>

          {/* Zitierhilfe */}
          <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-700 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
              <ExternalLink className="w-6 h-6 mr-3 text-green-400" />
              Jassguru.ch zitieren
            </h2>
            <p className="text-gray-300 mb-4">
              Wenn Sie Inhalte von Jassguru.ch in wissenschaftlichen Arbeiten oder Publikationen verwenden möchten:
            </p>
            <div className="bg-gray-900 p-6 rounded-lg font-mono text-sm text-gray-300">
              <p className="mb-2">
                <strong>Artikel zitieren (Beispiel):</strong>
              </p>
              <p className="text-green-400">
                Jassguru.ch (2025). "Schieber: Taktiken und Konventionen". 
                Abgerufen am [Datum] von https://jassguru.ch/wissen/schieber/taktiken/
              </p>
              <p className="mt-4 mb-2">
                <strong>Website zitieren:</strong>
              </p>
              <p className="text-green-400">
                Jassguru.ch (2025). "Das digitale Jass-Wikisportal". 
                https://jassguru.ch
              </p>
            </div>
          </div>

          {/* Transparenz-Hinweis */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-3">
              📖 Unsere Verpflichtung zur Qualität
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Alle Artikel auf Jassguru.ch wurden sorgfältig recherchiert und basieren auf anerkannten Quellen. 
              Die Inhalte wurden teilweise neu formuliert und für digitale Medien aufbereitet, um eine optimale 
              Lesbarkeit und Verständlichkeit zu gewährleisten. Bei Fragen oder Anregungen zu unseren Quellen 
              kontaktieren Sie uns gerne über <Link href="/impressum" className="text-green-400 hover:underline">unser Impressum</Link>.
            </p>
          </div>

          {/* Zurück-Link */}
          <div className="text-center pt-4">
            <Link
              href="/wissen"
              className="inline-flex items-center px-6 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 hover:text-white transition-colors font-medium border border-gray-600"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zurück zum Jass-Wiki
            </Link>
          </div>
        </div>
      </LexikonLayout>
  );
};

export default QuellenPage;

