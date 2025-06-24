import type { FirestorePlayer } from "@/types/jass"; // Import für referenzierte Felder
import type { UserMetadata } from "firebase/auth"; // Import für Firebase Metadaten

// Umbenannt von UserProfile und ergänzt
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  metadata: Pick<UserMetadata, 'creationTime' | 'lastSignInTime'>; // Nur relevante Metadaten
  
  // Felder aus FirestorePlayer (optional)
  lastActiveGroupId?: string | null;
  statusMessage?: string | null;
  playerId?: string | null;
  profileTheme?: string | null; // NEU: Profilfarbe/Theme für die UI
}

// Hinzugefügt:
export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type AppMode = "online" | "offline";
