import Head from "next/head";

const DatenschutzPage = () => {
  return (
    <>
      <Head>
        <title>Datenschutz - Jassguru</title>
        <meta name="description" content="Datenschutzerklärung von Jassguru" />
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
          <h1 className="text-3xl font-bold mb-6 text-white">Datenschutzerklärung</h1>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">1. Verantwortliche Stelle</h2>
          <p className="mb-4">
            Verantwortlich für die Datenerhebung und -verarbeitung auf dieser Webseite ist:
            <br />
            Remo Prinz
            <br />
            E-Mail: <a href="mailto:remo@jassguru.ch" className="underline">remo@jassguru.ch</a>
            <br />
            Telefon: <a href="tel:+41792375208" className="underline">+41 79 237 52 08</a>
          </p>

          <h2 className="text-2xl font-semibold mb-3 text-white">2. Allgemeines</h2>
          <p className="mb-4">
            Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Die Nutzung unserer App ist grundsätzlich im <strong>Gästemodus</strong> ohne Angabe personenbezogener Daten möglich.
          </p>
          <p className="mb-4">
            Wenn Sie Zusatzfunktionen wie persönliche Statistiken oder die Teilnahme an Spielgruppen nutzen möchten, ist eine Registrierung erforderlich. Nachfolgend informieren wir Sie über die Erhebung und Verwendung personenbezogener Daten bei der Nutzung von jassguru.ch.
          </p>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">3. Datenerfassung bei Registrierung</h2>
          <p className="mb-4">
            Bei der Registrierung erheben wir folgende Daten:
          </p>
          <ul className="list-disc list-inside mb-4 pl-4">
            <li><strong>E-Mail-Adresse & Jassname:</strong> Zur Erstellung Ihres Kontos, zur Sicherung des Logins und zur Identifikation in der App.</li>
            <li><strong>Jass-Resultate:</strong> Um die Statistik-Funktion zu ermöglichen. Diese Daten werden mit Ihrem Profil verknüpft.</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-3 text-white">4. Server-Standort und Drittanbieter</h2>
          <p className="mb-4">
            <strong>Website-Hosting:</strong> Die Jassguru.ch Web-App wird auf Servern von Hostpoint in der <strong>Schweiz</strong> gehostet.
          </p>
          <p className="mb-4">
            <strong>Daten-Speicherung:</strong> Für die Speicherung Ihrer Jass-Daten nutzen wir die Dienste von Google Firebase. Ihre Daten (Konto-Informationen, Jass-Resultate) werden auf Servern von Google in der <strong>Region Belgien (EU)</strong> gespeichert. Die EU verfügt über ein Datenschutzniveau, das vom Schweizer Gesetz als angemessen anerkannt wird.
          </p>
          <p className="mb-4">
            <strong>Wichtiger Hinweis zur Sicherheit:</strong> Jassguru.ch speichert und verwaltet selbst <strong>keine Passwörter</strong>. Die gesamte Benutzer-Authentifizierung wird von Google Firebase übernommen. Dies bedeutet:
          </p>
          <ul className="list-disc list-inside mb-4 pl-4">
            <li>Wenn Sie sich über "Mit Google fortfahren" anmelden, authentifiziert Sie Google direkt</li>
            <li>Wenn Sie sich mit E-Mail registrieren, verwaltet Google Firebase Ihr Passwort nach höchsten Sicherheitsstandards</li>
            <li>Wir haben zu keinem Zeitpunkt Zugriff auf Ihre Passwörter oder Anmeldedaten</li>
            <li>Passwort-Resets und Sicherheitsfeatures werden komplett von Google bereitgestellt</li>
          </ul>
          <p className="mb-4">
            Bei der Nutzung von "Mit Google fortfahren" findet ein Datenaustausch mit Google statt, um Ihre Identität zu bestätigen. Wir erhalten von Google nur die für die Registrierung notwendigen Daten (Name, E-Mail).
          </p>
          
          <h2 className="text-2xl font-semibold mb-3 text-white">5. Ihre Rechte</h2>
          <p className="mb-4">
            Sie haben jederzeit das Recht auf unentgeltliche <strong>Auskunft</strong> über Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der Datenverarbeitung sowie ein Recht auf <strong>Berichtigung</strong> oder <strong>Löschung</strong> dieser Daten.
          </p>
          <p className="mb-4">
            <strong>Datenlöschung:</strong> Die Löschung Ihres Kontos, Ihrer Jassgruppen und aller zugehörigen Daten erfolgt auf Anfrage per E-Mail an <a href="mailto:remo@jassguru.ch" className="underline">remo@jassguru.ch</a> oder telefonisch unter <a href="tel:+41792375208" className="underline">+41 79 237 52 08</a>. Eine automatische Löschung über die App ist derzeit nicht verfügbar. Nach Ihrer Löschungsanfrage werden alle personenbezogenen Daten schnellstmöglich und vollständig entfernt.
          </p>
          <p className="mb-4">
            Hierzu sowie zu weiteren Fragen zum Thema personenbezogene Daten können Sie sich jederzeit unter der oben angegebenen E-Mail-Adresse an uns wenden.
          </p>

          <p className="mt-8 text-sm text-gray-500">Stand: Juli 2024</p>
        </div>
      </div>
    </>
  );
};

export default DatenschutzPage; 