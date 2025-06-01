import React from 'react';
import type { TournamentGame, PlayerIdToNameMapping } from '@/types/tournament';

interface TournamentOverallStatisticsProps {
  tournamentGames: TournamentGame[];
  playerNamesMapping: PlayerIdToNameMapping;
  // Weitere Props könnten hier folgen, z.B. spezifische Turnierdaten
}

const TournamentOverallStatistics: React.FC<TournamentOverallStatisticsProps> = ({
  tournamentGames,
  playerNamesMapping,
}) => {
  // Logik zur Berechnung und Anzeige von Gesamtstatistiken hier implementieren
  // Beispiel: Anzahl gespielter Passen, Gesamtpunkte pro Spieler, etc.

  if (!tournamentGames || tournamentGames.length === 0) {
    return <p className="text-center text-gray-500 py-8">Noch keine Passen gespielt oder Statistiken verfügbar.</p>;
  }

  return (
    <div className="p-0 md:p-4">
      <h2 className="text-xl font-semibold mb-4 text-white">Turnier-Gesamtstatistik</h2>
      {/* <p>
        Hier werden demnächst die Gesamtstatistiken des Turniers angezeigt.
      </p> */}
      <div className="bg-gray-800/70 border-gray-700/50 shadow-lg rounded-lg p-4">
        <p className="text-gray-300">Anzahl gespielter Passen: <span className='text-white font-semibold'>{tournamentGames.length}</span></p>
        {/* Weitere statistische Auswertungen hier einfügen */}
        <p className="mt-4 text-sm text-gray-500">Detailliertere Statistiken folgen in Kürze.</p>
      </div>
    </div>
  );
};

export default TournamentOverallStatistics; 