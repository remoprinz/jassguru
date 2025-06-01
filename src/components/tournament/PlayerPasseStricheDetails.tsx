"use client";

import React from 'react';
import type { TournamentGame, PassePlayerDetail } from '@/types/tournament';
import type { StrokeSettings, StricheRecord, TeamPosition } from '@/types/jass';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { cn } from '@/lib/utils';

interface PlayerPasseStricheDetailsProps {
  playerGames: TournamentGame[];
  playerUid: string;
  playerName: string;
  strokeSettings?: StrokeSettings;
}

const getPlayerTeamInPasse = (passe: TournamentGame, playerUid: string): TeamPosition | null => {
  const playerDetail = passe.playerDetails?.find(detail => detail.playerId === playerUid);
  return playerDetail?.team || null;
};

const StrichItem: React.FC<{ label: string; value: number; highlight: boolean }> = ({ label, value, highlight }) => (
  <div className={cn("text-xs px-2 py-1 rounded", highlight ? "bg-purple-600/30 text-purple-200" : "bg-gray-700/50 text-gray-300")}>
    <span className="font-medium">{label}:</span> {value}
  </div>
);

const PlayerPasseStricheDetails: React.FC<PlayerPasseStricheDetailsProps> = ({
  playerGames,
  playerUid,
  playerName,
  strokeSettings = DEFAULT_STROKE_SETTINGS,
}) => {
  if (!playerGames || playerGames.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Passen-Daten für die Strich-Details verfügbar.</div>;
  }

  return (
    <div className="space-y-4">
      {playerGames.map((passe) => {
        const playerTeam = getPlayerTeamInPasse(passe, playerUid);
        if (!playerTeam) return null; // Spieler hat nicht an dieser Passe teilgenommen oder Teaminfo fehlt

        const teamStriche: StricheRecord | undefined = passe.teamStrichePasse?.[playerTeam];
        const opponentTeam: TeamPosition = playerTeam === 'top' ? 'bottom' : 'top';
        const opponentStriche: StricheRecord | undefined = passe.teamStrichePasse?.[opponentTeam];

        return (
          <div key={passe.passeId} className="bg-gray-800/60 p-3 rounded-lg shadow">
            <h4 className="text-sm font-semibold text-purple-300 mb-2">Passe {passe.passeNumber}</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-400 mb-1">Striche für {playerName} (Team {playerTeam === 'top' ? 'Oben' : 'Unten'})</p>
                {teamStriche ? (
                  <div className="space-y-1">
                    <StrichItem label="Berg" value={teamStriche.berg} highlight={teamStriche.berg > 0} />
                    <StrichItem label="Sieg" value={teamStriche.sieg} highlight={teamStriche.sieg > 0} />
                    <StrichItem label="Matsch" value={teamStriche.matsch} highlight={teamStriche.matsch > 0} />
                    <StrichItem label="Schneider" value={teamStriche.schneider} highlight={teamStriche.schneider > 0} />
                    <StrichItem label="Konterm." value={teamStriche.kontermatsch} highlight={teamStriche.kontermatsch > 0} />
                  </div>
                ) : <p className="text-xs text-gray-500">Keine Strichdaten.</p>}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Striche Gegnerteam</p>
                {opponentStriche ? (
                  <div className="space-y-1">
                    <StrichItem label="Berg" value={opponentStriche.berg} highlight={false} />
                    <StrichItem label="Sieg" value={opponentStriche.sieg} highlight={false} />
                    <StrichItem label="Matsch" value={opponentStriche.matsch} highlight={false} />
                    <StrichItem label="Schneider" value={opponentStriche.schneider} highlight={false} />
                    <StrichItem label="Konterm." value={opponentStriche.kontermatsch} highlight={false} />
                  </div>
                ) : <p className="text-xs text-gray-500">Keine Strichdaten.</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerPasseStricheDetails; 