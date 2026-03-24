/**
 * JVS Membership Service
 *
 * Prüft den JVS-Mitgliedsstatus eines Users via Cloud Function.
 * Wird vom authStore beim Login aufgerufen.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebaseInit';

export interface JvsMembershipResult {
  isMember: boolean;
  memberId?: string;
  membershipType?: string; // 'single' | 'partner' | 'patron' | 'jugend' | 'goenner'
  validUntil?: string; // ISO date
  memberSince?: string; // ISO date
  expired?: boolean;
}

/**
 * Prüft ob der eingeloggte User ein aktives JVS-Mitglied ist.
 * Ruft die checkJvsMembership Cloud Function auf.
 */
export async function checkJvsMembership(): Promise<JvsMembershipResult> {
  try {
    const functions = getFunctions(firebaseApp, 'europe-west1');
    const checkMembership = httpsCallable<Record<string, never>, JvsMembershipResult>(
      functions,
      'checkJvsMembership'
    );
    const result = await checkMembership({});
    return result.data;
  } catch (error) {
    console.error('[JVS] Membership check failed:', error);
    return { isMember: false };
  }
}
