export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  statusMessage?: string;
  creationTime?: string;
  lastSignInTime?: string;
}
