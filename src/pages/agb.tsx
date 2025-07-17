import Head from "next/head";

const AGBPage = () => {
  return (
    <>
      <Head>
        <title>AGB - Jassguru</title>
        <meta name="description" content="Allgemeine Geschäftsbedingungen von Jassguru" />
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
          <h1 className="text-3xl font-bold mb-6 text-white">Allgemeine Geschäftsbedingungen (AGB)</h1>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">1. Geltungsbereich</h2>
          <p className="mb-4">
            Diese Allgemeinen Geschäftsbedingungen (AGB) regeln die Nutzung der Web-Applikation jassguru.ch (nachfolgend "App"), betrieben von Remo Prinz (Kontaktdaten siehe Datenschutzerklärung).
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">2. Leistungsbeschreibung</h2>
          <p className="mb-4">
            Die App dient dem Erfassen von Jass-Resultaten. Die Kernfunktionen können ohne Registrierung im <strong>Gästemodus</strong> genutzt werden. Für Zusatzfunktionen wie persönliche Statistiken oder die Teilnahme an Spielgruppen ist ein kostenloses Benutzerkonto erforderlich. Der Dienst wird unentgeltlich zur Verfügung gestellt.
          </p>
          <p className="mb-4">
            <strong>Technische Sicherheit:</strong> Die Benutzer-Authentifizierung erfolgt ausschliesslich über Google Firebase. Jassguru.ch speichert selbst keine Passwörter und hat keinen Zugriff auf Ihre Anmeldedaten. Dies gewährleistet höchste Sicherheitsstandards für Ihr Konto.
          </p>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">3. Pflichten des Nutzers</h2>
          <p className="mb-4">
            Der Nutzer verpflichtet sich:
          </p>
          <ul className="list-disc list-inside mb-4 pl-4">
            <li>Bei der Registrierung eine korrekte und gültige E-Mail-Adresse anzugeben.</li>
            <li>Seine Google-Anmeldedaten sicher aufzubewahren und nicht an Dritte weiterzugeben.</li>
            <li>Die App nicht für rechtswidrige oder missbräuchliche Zwecke zu verwenden.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-3 text-white">4. Haftungsausschluss</h2>
          <p className="mb-4">
            Der Betreiber bemüht sich um eine hohe Verfügbarkeit der App, kann diese jedoch nicht jederzeit und unter allen Umständen garantieren. Jegliche Haftung für direkte oder indirekte Schäden, die aus der Nutzung oder Nichtverfügbarkeit der App entstehen, wird im gesetzlich zulässigen Rahmen ausgeschlossen. Der Betreiber haftet insbesondere nicht für die Korrektheit der von Nutzern erfassten Daten.
          </p>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">5. Kündigung und Datenlöschung</h2>
          <p className="mb-4">
            Der Nutzer kann die Löschung seines Kontos, seiner Jassgruppen und aller zugehörigen Daten jederzeit und ohne Angabe von Gründen per E-Mail an <a href="mailto:remo@jassguru.ch" className="underline">remo@jassguru.ch</a> oder telefonisch unter <a href="tel:+41792375208" className="underline">+41 79 237 52 08</a> beantragen. Eine automatische Löschung über die App ist derzeit nicht verfügbar. Mit der Löschung werden alle personenbezogenen Daten des Nutzers unwiderruflich entfernt, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">6. Schlussbestimmungen</h2>
          <p className="mb-4">
            Der Betreiber behält sich das Recht vor, diese AGB jederzeit zu ändern. Änderungen werden den Nutzern in geeigneter Weise bekannt gegeben.
          </p>
          <p>
            Es gilt ausschliesslich Schweizer Recht. Gerichtsstand ist am Sitz des Betreibers.
          </p>
          <p className="mt-8 text-sm text-gray-500">Stand: Juli 2024</p>
        </div>
      </div>
    </>
  );
};

export default AGBPage; 