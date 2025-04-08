export const toTitleCase = (str: string): string => {
    if (!str) return str;
    // Spezifische Jass-Namen korrekt umwandeln
    const mapping: Record<string, string> = {
        eichel: 'Eicheln',
        rosen: 'Rosen',
        schellen: 'Schellen',
        schilten: 'Schilten',
        // Füge hier ggf. weitere hinzu, falls benötigt
    };
    return mapping[str.toLowerCase()] || str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}; 