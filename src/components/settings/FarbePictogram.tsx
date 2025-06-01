import React from 'react';
// import { useUIStore } from "@/store/uiStore"; // Entfernen
import { getPictogram } from "@/utils/pictogramUtils";
import { toTitleCase } from "@/utils/formatUtils";
import { CARD_SYMBOL_MAPPINGS } from "@/config/CardStyles";
import type { JassColor, CardStyle } from "@/types/jass";

interface FarbePictogramProps {
  farbe: JassColor;
  mode?: 'svg' | 'emoji';
  cardStyle?: CardStyle; // Bleibt optional, falls Default gewünscht
  className?: string;
}

// Extrahierte FarbePictogram Komponente
export const FarbePictogram: React.FC<FarbePictogramProps> = ({ 
  farbe, 
  mode = 'svg', 
  cardStyle = 'DE', // Default auf 'DE' setzen, falls nichts übergeben wird
  className
}) => {
  // const settingsCardStyle = useUIStore((state) => state.settings.cardStyle); // Entfernen
  
  const pictogramUrl = getPictogram(farbe, mode, cardStyle); // Wieder als URL betrachten
  
  // === Sicherer Zugriff auf displayName mit Title Case und korrekter cardStyle-Prop ===
  const mappedFarbeKey = toTitleCase(farbe);
  // Verwende die übergebene/default cardStyle-Prop für den DisplayNamen
  const displayName = CARD_SYMBOL_MAPPINGS[mappedFarbeKey as JassColor]?.[cardStyle] ?? mappedFarbeKey;
  // === Ende Anpassung ===

  if (!pictogramUrl) {
    return null; // Wenn kein Pfad gefunden wurde
  }

  // Render-Logik korrigiert: Verwende <img> Tag für SVG, oder span für Emoji
  return (
    <div className={`flex items-center justify-center w-8 h-8 ${className ?? ''}`}> 
      {mode === 'emoji' ? (
        <span className="text-2xl">{pictogramUrl}</span>
      ) : (
        <img 
          src={pictogramUrl} 
          alt={displayName} 
          className="w-6 h-6 object-contain" // Feste Größe festlegen
        />
      )}
    </div>
  );
}; 