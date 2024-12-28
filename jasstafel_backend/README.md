# Jass Kreidetafel

Dieses Projekt ist eine digitale Jass-Kreidetafel, entwickelt mit Next.js, TypeScript und Tailwind CSS.

## Repository

Dieses Projekt ist auf GitHub gehostet: [https://github.com/promzo/jassguru/tree/main/jasstafel]

## Produktive App

Die produktive Version der App ist unter [https://jassguru.web.app/](https://jassguru.web.app/) gehostet.

## Lokale Entwicklung

Um das Projekt lokal zu starten, folgen Sie diesen Schritten:

1. Klonen Sie das Repository:
   ```
   git clone https://github.com/promzo/jassguru.git
   cd jassguru/jasstafel
   ```

2. Installieren Sie die Abhängigkeiten:
   ```
   npm install
   ```

3. Starten Sie den Entwicklungsserver:
   ```
   npm run dev
   ```
   oder
   ```
   npm start
   ```

   Die Anwendung ist nun unter [http://localhost:3000](http://localhost:3000) verfügbar.

## Verfügbare Skripte

Im Projektverzeichnis können Sie folgende Befehle ausführen:

### `npm run dev` oder `npm start`

Startet den Entwicklungsserver. Öffnen Sie [http://localhost:3000](http://localhost:3000), um die Anwendung im Browser zu sehen.

### `npm run build`

Erstellt eine optimierte Produktionsversion der Anwendung.

### `npm run start:prod`

Startet den Produktionsserver mit der gebauten Anwendung. Führen Sie diesen Befehl nach `npm run build` aus.

### `npm run lint`

Führt den Linter aus, um Codequalität und Stilkonsistenz zu überprüfen.

## Debug-Logs anzeigen

Um die Debug-Logs anzuzeigen oder auszublenden, verwenden Sie die Tastenkombination `Ctrl+D` während die Anwendung läuft. Dies schaltet die Anzeige der Debug-Informationen ein oder aus.

## Deployment

Das Projekt wird auf Firebase gehostet. Für das Deployment auf Firebase, stellen Sie sicher, dass Sie die Firebase CLI installiert haben und korrekt konfiguriert sind. Dann können Sie folgenden Befehl ausführen:

```
npm run deploy
```

## Projektstruktur

- `src/`: Enthält den Quellcode der Anwendung
  - `components/`: React-Komponenten
  - `pages/`: Next.js-Seiten
  - `styles/`: CSS-Dateien
  - `services/`: Firebase-Initialisierung und andere Dienste
- `public/`: Statische Dateien wie Bilder und Manifest
- `out/`: Ausgabeverzeichnis für den Build-Prozess

## Technologien

- Next.js
- React
- TypeScript
- Tailwind CSS
- Firebase (Hosting und Authentifizierung)

## PWA-Funktionalität

Die Anwendung ist als Progressive Web App (PWA) konfiguriert. Der Service Worker und das Web-Manifest sind in den entsprechenden Dateien im `public/`-Verzeichnis definiert.

## Lizenz

[Meine Lizenzinformationen hier]