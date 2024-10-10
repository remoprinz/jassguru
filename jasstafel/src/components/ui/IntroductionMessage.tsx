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
          <li>Swipe nach unten/oben, um das Menü zu öffnen/schliessen</li>
          <li>Halte lange gedrückt, um den Punktezähler zu öffnen. Klicke ausserhalb, um ihn zu schliessen</li>
          <li>Gezählt wird auf der Seite, auf die gedrückt wurde. Die Punkte der Gegner werden automatisch mitgeschrieben</li>
          <li>Schreibe Weise durch Klicken auf die Z-Linien</li>
          <li>Swipe links/rechts, um die Punkte-Historie anzusehen. Eintippen von Resultaten nach alten Runden, überschreibt neue Runden</li>
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