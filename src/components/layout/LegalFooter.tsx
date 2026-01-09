import Link from "next/link";
import Image from "next/image";

export const LegalFooter = () => {
  return (
    <footer className="mt-6 pb-4 text-center">
      <div className="flex flex-wrap justify-center items-center gap-4 text-xs text-gray-500 mb-2">
        <Link 
          href="/impressum"
          className="hover:text-gray-300 transition-colors"
        >
          Impressum
        </Link>
        <span className="text-gray-700">•</span>
        <Link 
          href="/datenschutz"
          className="hover:text-gray-300 transition-colors"
        >
          Datenschutz
        </Link>
        <span className="text-gray-700">•</span>
        <Link 
          href="/agb"
          className="hover:text-gray-300 transition-colors"
        >
          AGB
        </Link>
      </div>
      
      {/* Lebendige Traditionen */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="text-xs text-gray-500 text-center max-w-lg px-4 space-y-2">
          <p>
            JassGuru dokumentiert Jassen als vom Bundesamt für Kultur (BAK) anerkannte{' '}
            <a 
              href="https://www.lebendige-traditionen.ch/tradition/de/home/traditionen/jassen.html" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-green-400 underline"
            >
              lebendige Tradition
            </a>.
          </p>
        </div>
        <a
          href="https://www.lebendige-traditionen.ch/tradition/de/home/traditionen/jassen.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity w-full max-w-[160px] sm:max-w-[200px]"
          aria-label="Lebendige Traditionen - Bundesamt für Kultur"
        >
          <Image
            src="/logo_lebendige_traditionen_hellgrau.png"
            alt="Jass ist als Lebendige Tradition der Schweiz anerkannt"
            width={320}
            height={160}
            className="w-full h-auto"
          />
        </a>
      </div>
      
      <p className="text-xs text-gray-600 mt-4">
        &copy; {new Date().getFullYear()} jassguru.ch - Alle Rechte vorbehalten
      </p>
    </footer>
  );
}; 