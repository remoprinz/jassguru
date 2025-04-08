import React from 'react';
import { useUIStore } from "@/store/uiStore";
import { getPictogram } from "@/utils/pictogramUtils";
import { toTitleCase } from "@/utils/stringUtils";
import { CARD_SYMBOL_MAPPINGS } from "@/config/CardStyles";
import type { JassColor, CardStyle } from "@/types/jass";

// Extrahierte FarbePictogram Komponente
export const FarbePictogram: React.FC<{ 
  farbe: JassColor, 
  mode: "svg" | "emoji",
  className?: string // Optional className hinzugefügt für Flexibilität
}> = ({farbe, mode, className}) => {
  const settingsCardStyle = useUIStore((state) => state.settings.cardStyle);
  const pictogramUrl = getPictogram(farbe, mode, settingsCardStyle);
  
  // === Sicherer Zugriff auf displayName mit Title Case ===
  const mappedFarbeKey = toTitleCase(farbe);
  const displayName = CARD_SYMBOL_MAPPINGS[mappedFarbeKey as JassColor]?.[settingsCardStyle] ?? mappedFarbeKey;
  // === Ende Sicherer Zugriff ===

  return (
    <div className={`flex items-center justify-center w-8 h-8 ${className ?? ''}`}>
      {mode === "emoji" ? (
        <span className="text-2xl">{pictogramUrl}</span>
      ) : (
        <img
          src={pictogramUrl}
          alt={displayName}
          className="w-6 h-6 object-contain"
        />
      )}
    </div>
  );
}; 