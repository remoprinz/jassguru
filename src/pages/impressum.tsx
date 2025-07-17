import Head from "next/head";

const ImpressumPage = () => {
  return (
    <>
      <Head>
        <title>Impressum - Jassguru</title>
        <meta name="description" content="Impressum und Kontaktdaten von Jassguru" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div 
        className="min-h-screen bg-gray-900 text-gray-300" 
        style={{ 
          height: '100vh', 
          overflowY: 'scroll', 
          WebkitOverflowScrolling: 'touch' 
        }}
      >
        <div className="container mx-auto px-4 py-8 max-w-4xl" style={{ paddingBottom: '2rem' }}>
          <h1 className="text-3xl font-bold mb-6 text-white">Impressum</h1>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">Angaben zum Diensteanbieter</h2>
          <p className="mb-4">
            <strong>Betreiber:</strong> Remo Prinz
            <br />
            <strong>E-Mail:</strong> <a href="mailto:remo@jassguru.ch" className="underline">remo@jassguru.ch</a>
            <br />
            <strong>Telefon:</strong> <a href="tel:+41792375208" className="underline">+41 79 237 52 08</a>
            <br />
            <strong>Website:</strong> <a href="https://jassguru.ch" className="underline">jassguru.ch</a>
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">Zweck der Website</h2>
          <p className="mb-4">
            Jassguru.ch ist eine kostenlose Progressive Web Application (PWA) zum Erfassen und Verwalten von Jass-Resultaten. 
            Die App bietet sowohl einen Gästemodus ohne Registrierung als auch erweiterte Funktionen für registrierte Benutzer.
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">Technische Umsetzung</h2>
          <p className="mb-4">
            Die Anwendung basiert auf modernen Web-Technologien (React, Next.js, TypeScript) und wird auf Servern von 
            <strong> Hostpoint in der Schweiz</strong> gehostet. Für Authentifizierung und Datenspeicherung nutzen wir 
            Google Firebase mit Servern in der <strong>EU (Belgien)</strong>.
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">Haftungsausschluss</h2>
          <p className="mb-4">
            <strong>Inhalte:</strong> Der Betreiber bemüht sich um korrekte und aktuelle Informationen, übernimmt jedoch keine 
            Gewähr für die Vollständigkeit, Richtigkeit und Aktualität der bereitgestellten Inhalte.
          </p>
          <p className="mb-4">
            <strong>Verfügbarkeit:</strong> Eine ständige Verfügbarkeit der Website kann nicht garantiert werden. 
            Der Betreiber behält sich vor, den Dienst jederzeit zu ändern, zu unterbrechen oder einzustellen.
          </p>
          <p className="mb-4">
            <strong>Externe Links:</strong> Für die Inhalte verlinkter externer Seiten ist ausschliesslich deren Betreiber verantwortlich. 
            Der Betreiber distanziert sich von allen Inhalten, die gegen geltendes Recht verstossen.
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">Urheberrecht</h2>
          <p className="mb-4">
            Alle Inhalte dieser Website (Texte, Bilder, Grafiken, Design, Code) sind urheberrechtlich geschützt. 
            Eine Vervielfältigung oder Verwendung ohne ausdrückliche Genehmigung ist nicht gestattet.
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">Anwendbares Recht</h2>
          <p className="mb-4">
            Für sämtliche Rechtsbeziehungen gilt ausschliesslich Schweizer Recht unter Ausschluss der Kollisionsnormen 
            und des UN-Kaufrechts.
          </p>

          <p className="mt-8 text-sm text-gray-500">Stand: Juli 2024</p>
        </div>
      </div>
    </>
  );
};

export default ImpressumPage; 