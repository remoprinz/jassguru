import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 🚨 NEU: Zentrale Funktion zur Prüfung, ob ein Pfad öffentlich zugänglich ist.
 * Dies ist die einzige Quelle der Wahrheit für die gesamte App.
 * @param path Der zu prüfende URL-Pfad (z.B. router.pathname).
 * @returns true, wenn der Pfad öffentlich ist, sonst false.
 */
export function isPublicPath(path: string): boolean {
  if (path === '/') {
    return true; // Die Startseite ist immer öffentlich.
  }

  const publicPathBases = [
    '/auth',
    '/jass',
    '/join',
    '/impressum',
    '/datenschutz',
    '/view',
    '/profile'
  ];

  return publicPathBases.some(base => path.startsWith(base));
}
