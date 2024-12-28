import React from 'react';
import { FaInfoCircle } from 'react-icons/fa';

interface IntroductionMessageProps {
  message: string;
  onDismiss: () => void;
  show: boolean;
  showTitle?: boolean;
}

const IntroductionMessage: React.FC<IntroductionMessageProps> = ({ 
  onDismiss, 
  showTitle = true, 
  message,
  show
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 animate-fade-in pointer-events-auto">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white">
        <div className="flex flex-col items-center justify-center mb-4">
          <FaInfoCircle className="w-12 h-12 text-yellow-600 mb-2" />
          {showTitle && <h2 className="text-xl font-bold text-center">{message}</h2>}
        </div>
        <ul className="list-disc pl-5 mb-6 space-y-2">
          <li>Swipe nach unten/oben für das Menü. Dort kannst du die Einstellungen vornehmen</li>
          <li>Mit dem grünen Knopf im Menü öffnest du die Resultattafel und startest ein neues Spiel</li>
          <li>Halte die Seite des zählenden Spielers lange gedrückt, um die Punkte einzutragen</li>          
          <li>Doppelklicke auf deine Seite für Spiel-Informationen, Berg und Bedanken</li>
          <li>Schreibe Weise durch Klicken auf die Z-Linie</li>
          <li>Navigiere durch die Spiel-Historie durch links/rechts Swipen und korrigiere Ergebnisse</li>
        </ul>
        <button
          onClick={onDismiss}
          className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors w-full text-lg font-semibold"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
};

export default IntroductionMessage;