"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { imageMigration, analyzeImageSizes } from '@/utils/imageMigration';
import { AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';

interface ImageMigrationToolProps {
  onClose: () => void;
}

/**
 * Admin-Tool für Bild-Migration (optional)
 * Zeigt Optimierungspotential und kann Batch-Migration durchführen
 */
export const ImageMigrationTool: React.FC<ImageMigrationToolProps> = ({ onClose }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationResults, setMigrationResults] = useState<any>(null);

  const analyzeImages = async () => {
    setIsAnalyzing(true);
    try {
      // Beispiel-URLs - in der Praxis würden Sie diese aus Firestore laden
      const sampleUrls = [
        // Würde aus User-Profilen und Gruppen geladen werden
      ];
      
      const results = await analyzeImageSizes(sampleUrls);
      setAnalysis(results);
    } catch (error) {
      console.error('Analyse fehlgeschlagen:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startMigration = async () => {
    if (!analysis) return;
    
    setIsMigrating(true);
    try {
      const imageUrls = []; // URLs aus Firestore laden
      
      const results = await imageMigration.batchMigrate(
        imageUrls,
        async (file, originalUrl) => {
          // Upload-Callback - würde den entsprechenden Service aufrufen
          console.log('Migration:', originalUrl);
          return 'new-url'; // Placeholder
        },
        (completed, total) => {
          setMigrationProgress((completed / total) * 100);
        }
      );
      
      setMigrationResults(results);
    } catch (error) {
      console.error('Migration fehlgeschlagen:', error);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900">🖼️ Bild-Optimierung</h2>
        
        {!analysis && !migrationResults && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Analysiert alle Profilbilder und Logos auf Optimierungspotential.
            </p>
            <Button 
              onClick={analyzeImages} 
              disabled={isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Optimierung analysieren
                </>
              )}
            </Button>
          </div>
        )}

        {analysis && !migrationResults && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">📊 Analyse-Ergebnis</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <div>Bilder gesamt: <strong>{analysis.totalCount}</strong></div>
                <div>Zu groß: <strong>{analysis.oversizedCount}</strong></div>
                <div>Gesamtgröße: <strong>{analysis.totalSizeKB}KB</strong></div>
                <div className="text-green-700">
                  Mögliche Einsparung: <strong>{analysis.potentialSavingsKB}KB</strong>
                </div>
              </div>
            </div>

            {analysis.oversizedCount > 0 ? (
              <Button 
                onClick={startMigration}
                disabled={isMigrating}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isMigrating ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Optimiere... ({migrationProgress.toFixed(0)}%)
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    {analysis.oversizedCount} Bilder optimieren
                  </>
                )}
              </Button>
            ) : (
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-green-800">Alle Bilder sind bereits optimiert! 🎉</p>
              </div>
            )}
          </div>
        )}

        {migrationResults && (
          <div className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">✅ Migration abgeschlossen</h3>
              <div className="text-sm text-green-800 space-y-1">
                <div>Erfolgreich: <strong>{migrationResults.success.length}</strong></div>
                <div>Fehler: <strong>{migrationResults.failed.length}</strong></div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1"
          >
            Schließen
          </Button>
        </div>
      </div>
    </div>
  );
};
