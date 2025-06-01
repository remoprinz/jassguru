/**
 * Utility-Funktionen zur Verarbeitung von Einladungs-Tokens und -URLs.
 */

export interface ExtractedTokenResult {
  type: "group" | "tournament" | "invalid" | "ambiguous";
  token: string | null;
  error?: string;
}

const JASSGURU_BASE_URL = "https://jassguru.ch/join";
// Tokens sind aktuell 48 Zeichen lange Hex-Strings (24 Bytes * 2)
const TOKEN_LENGTH = 48;
const TOKEN_REGEX = /^[a-f0-9]{48}$/i; // Prüft auf Hex-String der Länge 48

export const extractAndValidateToken = (
  inputValue: string,
  contextualType?: "group" | "tournament"
): ExtractedTokenResult => {
  let potentialToken = inputValue.trim();
  let type: ExtractedTokenResult["type"] = "invalid";
  let finalToken: string | null = null;
  let error: string | undefined;

  try {
    if (potentialToken.toLowerCase().startsWith("http") || potentialToken.includes("?")) {
      const url = new URL(potentialToken.startsWith("http") ? potentialToken : `https://dummybase${potentialToken.startsWith("/") ? "" : "/"}${potentialToken}`);
      
      // Prüfen, ob es eine Jassguru Join URL ist (optional, aber gut für Robustheit)
      // if (!url.href.toLowerCase().startsWith(JASSGURU_BASE_URL)) {
      //   return { type: "invalid", token: null, error: "Link scheint nicht von Jassguru zu sein." };
      // }

      const groupToken = url.searchParams.get("token");
      const tournamentToken = url.searchParams.get("tournamentToken");

      if (groupToken) {
        type = "group";
        potentialToken = groupToken;
      } else if (tournamentToken) {
        type = "tournament";
        potentialToken = tournamentToken;
      } else {
        return { type: "invalid", token: null, error: "Link enthält keinen gültigen Einladungscode." };
      }
    } else {
      // Es ist ein reiner Token-String. Der Typ wird durch contextualType bestimmt, wenn vorhanden.
      if (contextualType) {
        type = contextualType;
      } else {
        // Wenn kein Kontext gegeben, ist der Typ des reinen Tokens mehrdeutig.
        type = "ambiguous"; 
      }
    }

    // Validierung des extrahierten/übergebenen Tokens
    if (potentialToken.length !== TOKEN_LENGTH) {
      error = `Ungültige Code-Länge. Erwartet: ${TOKEN_LENGTH} Zeichen.`;
    } else if (!TOKEN_REGEX.test(potentialToken)) {
      error = "Ungültiges Code-Format. Nur Zahlen (0-9) und Buchstaben (a-f) erlaubt.";
    }

    if (error) {
      return { type: "invalid", token: null, error };
    }

    finalToken = potentialToken;
    
    // Wenn der Typ nach der Validierung immer noch "ambiguous" ist (war reiner Token ohne Kontext)
    if (type === "ambiguous") {
        return { type: "ambiguous", token: finalToken, error: "Der Typ des Codes (Gruppe/Turnier) konnte nicht automatisch bestimmt werden." };
    }

    return { type, token: finalToken };

  } catch (e) {
    // Fehler beim Parsen der URL oder andere Fehler
    // console.error("[extractAndValidateToken] Fehler:", e);
    return { type: "invalid", token: null, error: "Eingabe konnte nicht verarbeitet werden. Ist es ein gültiger Link oder Code?" };
  }
}; 