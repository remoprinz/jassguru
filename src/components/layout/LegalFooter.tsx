import Link from "next/link";

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
      <p className="text-xs text-gray-600">
        &copy; {new Date().getFullYear()} jassguru.ch - Alle Rechte vorbehalten
      </p>
    </footer>
  );
}; 