import React from 'react';
import { GetStaticProps, NextPage } from 'next';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import { SeoHead } from '@/components/layout/SeoHead';

const SourcesPage: NextPage = () => {
  const breadcrumbItems = [
    { name: 'Jass-Wiki', href: '/wissen' },
    { name: 'Referenzen', href: '/wissen/referenzen' },
    { name: 'Quellen', href: '/wissen/referenzen/quellen' }
  ];

  const sources = [
    {
      title: 'STÖCK WYS STICH – Der neue Schweizer Jassführer',
      author: 'Dani Müller',
      type: 'Taschenbuch',
      date: '26. September 2016',
      description: 'Das Standardwerk für Schweizer Jass-Regeln und -Varianten. Umfassende Darstellung aller wichtigen Aspekte des Jass-Spiels.',
      usage: 'Hauptquelle für Spielregeln, Weis-Regeln, Schieber und die meisten Jass-Varianten.'
    },
    {
      title: 'Offizielles Schweizer Jassreglement',
      author: 'Schweizerischer Jassverband',
      type: 'Offizielles Regelwerk',
      date: 'Aktuelle Fassung',
      description: 'Das offizielle Regelwerk des Schweizerischen Jassverbandes für Turniere und Meisterschaften.',
      usage: 'Referenz für standardisierte Spielregeln und Turnier-Richtlinien.'
    },
    {
      title: 'Jassbuch',
      author: 'Verschiedene Autoren',
      type: 'Sammelwerk',
      date: 'Verschiedene Auflagen',
      description: 'Sammlung von Jass-Regeln und -Varianten aus verschiedenen Regionen der Schweiz.',
      usage: 'Zusätzliche Varianten und regionale Besonderheiten.'
    }
  ];

  return (
    <>
      <SeoHead
        title="Quellen - Jassguru.ch"
        description="Übersicht aller Quellen und Referenzen, die für die Inhalte auf Jassguru.ch verwendet wurden."
      />

      <LexikonLayout breadcrumbItems={breadcrumbItems}>
        <div className="space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Quellen und Referenzen
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto">
              Die Grundlage für unser Jass-Wiki bilden diese vertrauenswürdigen Quellen
            </p>
          </div>

          {/* Sources Grid */}
          <div className="grid gap-6 sm:gap-8">
            {sources.map((source, index) => (
              <div key={index} className="bg-gray-800 border border-gray-700 rounded-xl p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{index + 1}</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                        {source.title}
                      </h3>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p><strong>Autor:</strong> {source.author}</p>
                        <p><strong>Typ:</strong> {source.type}</p>
                        <p><strong>Datum:</strong> {source.date}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-green-400 mb-2">Beschreibung</h4>
                      <p className="text-gray-300 leading-relaxed">
                        {source.description}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-green-400 mb-2">Verwendung bei Jassguru</h4>
                      <p className="text-gray-300 leading-relaxed">
                        {source.usage}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 sm:p-8">
            <h3 className="text-xl font-bold text-white mb-4">Hinweis zur Quellenverwendung</h3>
            <div className="text-gray-300 leading-relaxed space-y-3">
              <p>
                Die Inhalte auf Jassguru.ch basieren auf diesen etablierten Quellen, wurden jedoch für eine bessere
                digitale Erfahrung neu strukturiert und formatiert. Dabei haben wir:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                <li>Komplexe Sachverhalte in übersichtliche Abschnitte gegliedert</li>
                <li>Strukturierte Listen für bessere Lesbarkeit erstellt</li>
                <li>SEO-optimierte Formatierung für Suchmaschinen hinzugefügt</li>
                <li>Querverweise zwischen verwandten Themen implementiert</li>
              </ul>
              <p>
                Dennoch bleiben wir den Originalquellen treu und respektieren das geistige Eigentum der Autoren.
              </p>
            </div>
          </div>

          {/* Back Button */}
          <div className="text-center pt-8 border-t border-gray-700">
            <a
              href="/wissen/referenzen"
              className="inline-flex items-center px-6 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 hover:text-white transition-colors font-medium border border-gray-600"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zurück zu Referenzen
            </a>
          </div>
        </div>
      </LexikonLayout>
    </>
  );
};

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {}
  };
};

export default SourcesPage;
