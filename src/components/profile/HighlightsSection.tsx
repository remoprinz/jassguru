import React from 'react';
import { useRouter } from 'next/router';
import type { TransformedPlayerStats } from '@/utils/statsTransformer';

interface HighlightsSectionProps {
  playerStats: TransformedPlayerStats;
  groupId?: string;
}

export const HighlightsSection: React.FC<HighlightsSectionProps> = ({
  playerStats,
  groupId
}) => {
  const router = useRouter();

  const handleClick = (relatedId?: string, relatedType?: 'session' | 'game') => {
    if (relatedId) {
      const path = relatedType === 'session' 
        ? `/view/session/${relatedId}`
        : `/view/game/${relatedId}`;
      router.push(path);
    }
  };

  return (
    <>
      {/* Highlights Partien */}
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">Highlights Partien</h3>
        </div>
        <div className="p-4 space-y-2">
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.highestStricheSession?.relatedId, playerStats.highestStricheSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.highestStricheSession?.value || '-'}</span>
                {playerStats.highestStricheSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.highestStricheSession.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestWinStreakSessions?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Siegesserie:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestWinStreakSessions?.value || '-'}</span>
                {playerStats.longestWinStreakSessions?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestWinStreakSessions.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestUndefeatedStreakSessions?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestUndefeatedStreakSessions?.value || '-'}</span>
                {playerStats.longestUndefeatedStreakSessions?.dateRange && (
                  <span className="text-blue-400 text-sm">({playerStats.longestUndefeatedStreakSessions.dateRange})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostMatschSession?.relatedId, playerStats.mostMatschSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostMatschSession?.value || '-'}</span>
                {playerStats.mostMatschSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostMatschSession.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostWeisPointsSession?.relatedId, playerStats.mostWeisPointsSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostWeisPointsSession?.value || '-'}</span>
                {playerStats.mostWeisPointsSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostWeisPointsSession.date})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights Spiele */}
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">Highlights Spiele</h3>
        </div>
        <div className="p-4 space-y-2">
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.highestStricheGame?.relatedId, playerStats.highestStricheGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.highestStricheGame?.value || '-'}</span>
                {playerStats.highestStricheGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.highestStricheGame.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestWinStreakGames?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Siegesserie:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestWinStreakGames?.value || '-'}</span>
                {playerStats.longestWinStreakGames?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestWinStreakGames.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestUndefeatedStreakGames?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestUndefeatedStreakGames?.value || '-'}</span>
                {playerStats.longestUndefeatedStreakGames?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestUndefeatedStreakGames.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostMatschGame?.relatedId, playerStats.mostMatschGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostMatschGame?.value || '-'}</span>
                {playerStats.mostMatschGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostMatschGame.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostWeisPointsGame?.relatedId, playerStats.mostWeisPointsGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostWeisPointsGame?.value || '-'}</span>
                {playerStats.mostWeisPointsGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostWeisPointsGame.date})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lowlights Partien */}
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">Lowlights Partien</h3>
        </div>
        <div className="p-4 space-y-2">
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.highestStricheReceivedSession?.relatedId, playerStats.highestStricheReceivedSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">-{playerStats.highestStricheReceivedSession?.value || '-'}</span>
                {playerStats.highestStricheReceivedSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.highestStricheReceivedSession.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestLossStreakSessions?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Niederlagenserie:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestLossStreakSessions?.value || '-'}</span>
                {playerStats.longestLossStreakSessions?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestLossStreakSessions.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestWinlessStreakSessions?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestWinlessStreakSessions?.value || '-'}</span>
                {playerStats.longestWinlessStreakSessions?.dateRange && (
                  <span className="text-blue-400 text-sm">({playerStats.longestWinlessStreakSessions.dateRange})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostMatschReceivedSession?.relatedId, playerStats.mostMatschReceivedSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostMatschReceivedSession?.value || '-'}</span>
                {playerStats.mostMatschReceivedSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostMatschReceivedSession.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostWeisPointsReceivedSession?.relatedId, playerStats.mostWeisPointsReceivedSession?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Meisten Weispunkte erhalten:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostWeisPointsReceivedSession?.value || '-'}</span>
                {playerStats.mostWeisPointsReceivedSession?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostWeisPointsReceivedSession.date})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lowlights Spiele */}
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">Lowlights Spiele</h3>
        </div>
        <div className="p-4 space-y-2">
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.highestStricheReceivedGame?.relatedId, playerStats.highestStricheReceivedGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">-{playerStats.highestStricheReceivedGame?.value || '-'}</span>
                {playerStats.highestStricheReceivedGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.highestStricheReceivedGame.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestLossStreakGames?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Niederlagenserie:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestLossStreakGames?.value || '-'}</span>
                {playerStats.longestLossStreakGames?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestLossStreakGames.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.longestWinlessStreakGames?.startSessionId)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.longestWinlessStreakGames?.value || '-'}</span>
                {playerStats.longestWinlessStreakGames?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.longestWinlessStreakGames.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostMatschReceivedGame?.relatedId, playerStats.mostMatschReceivedGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostMatschReceivedGame?.value || '-'}</span>
                {playerStats.mostMatschReceivedGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostMatschReceivedGame.date})</span>
                )}
              </div>
            </div>
          </div>
          
          <div 
            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
            onClick={() => handleClick(playerStats.mostWeisPointsReceivedGame?.relatedId, playerStats.mostWeisPointsReceivedGame?.relatedType)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
              <div className="flex flex-col items-end">
                <span className="text-gray-100">{playerStats.mostWeisPointsReceivedGame?.value || '-'}</span>
                {playerStats.mostWeisPointsReceivedGame?.date && (
                  <span className="text-blue-400 text-sm">({playerStats.mostWeisPointsReceivedGame.date})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}; 