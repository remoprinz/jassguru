/**
 * JVS Membership Cloud Functions
 * 
 * Verwaltet Mitgliedschaften für den Jassverband Schweiz.
 * Teil des Firebase Extension für das Jass-Ökosystem.
 * 
 * @author Stöck (Backend-Agent)
 * @version 1.0.0
 * @created 2026-02-24
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

// =====================================================================
// TYPES
// =====================================================================

export type MembershipType = 'single' | 'partner' | 'patron';
export type MembershipStatus = 'pending' | 'active' | 'expired' | 'cancelled';
export type PaymentProvider = 'stripe' | 'twint' | 'manual';

export interface JvsMemberAddress {
  street?: string;
  zip?: string;
  city?: string;
  canton?: string;
}

export interface JvsMember {
  id: string;
  uid: string;                    // Firebase Auth UID
  playerId?: string;              // Verknüpfung zu Jasstafel Player
  
  // Persönliche Daten
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: JvsMemberAddress;
  
  // Mitgliedschaft
  membershipType: MembershipType;
  memberNumber?: number;
  season?: number;
  memberSince: admin.firestore.Timestamp;
  validUntil: admin.firestore.Timestamp;
  status: MembershipStatus;
  
  // Verknüpfungen
  partnerId?: string;             // Bei Partner-Mitgliedschaft
  clubId?: string;                // Falls Club-Mitglied
  
  // Meta
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface JvsSubscription {
  id: string;
  memberId: string;
  
  // Stripe
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePaymentIntentId?: string;
  
  // Twint (später)
  twintPaymentId?: string;
  
  // Status
  provider: PaymentProvider;
  status: 'pending' | 'active' | 'past_due' | 'cancelled';
  currentPeriodStart: admin.firestore.Timestamp;
  currentPeriodEnd: admin.firestore.Timestamp;
  
  // Preis
  amount: number;                 // in Rappen
  currency: 'CHF';
  
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// Mitgliedschaftspreise in Rappen
const MEMBERSHIP_PRICES: Record<MembershipType, number> = {
  single: 6000,   // CHF 60
  partner: 9000,  // CHF 90
  patron: 35000,  // CHF 350
};

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Generiert ein Ablaufdatum (1 Jahr ab jetzt)
 */
function getExpirationDate(): admin.firestore.Timestamp {
  const now = new Date();
  const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  return admin.firestore.Timestamp.fromDate(nextYear);
}

/**
 * Versucht, einen JVS-Member mit einem Jasstafel-Player zu verknüpfen
 */
async function linkMemberToPlayer(memberId: string, uid: string): Promise<string | null> {
  try {
    // Suche Player mit dieser UID
    const playerQuery = await db.collection('players').where('userId', '==', uid).limit(1).get();
    
    if (playerQuery.empty) {
      logger.info(`[linkMemberToPlayer] Kein Player für UID ${uid} gefunden.`);
      return null;
    }
    
    const playerId = playerQuery.docs[0].id;
    
    // Verknüpfung setzen
    await db.collection('jvs_members').doc(memberId).update({
      playerId: playerId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`[linkMemberToPlayer] Member ${memberId} mit Player ${playerId} verknüpft.`);
    return playerId;
  } catch (error) {
    logger.error(`[linkMemberToPlayer] Fehler:`, error);
    return null;
  }
}

// =====================================================================
// CLOUD FUNCTIONS
// =====================================================================

/**
 * Erstellt einen neuen JVS-Member
 * 
 * Wird aufgerufen nach erfolgreicher Registrierung auf jassverband.ch
 */
interface CreateJvsMemberData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: JvsMemberAddress;
  membershipType: MembershipType;
  partnerId?: string;
}

export const createJvsMember = onCall<CreateJvsMemberData>({
  region: "europe-west1"
}, async (request) => {
  // Auth Check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentifizierung erforderlich.');
  }
  
  const uid = request.auth.uid;
  const data = request.data;
  
  // Validierung
  if (!data.firstName || !data.lastName || !data.email || !data.membershipType) {
    throw new HttpsError('invalid-argument', 'Pflichtfelder fehlen: firstName, lastName, email, membershipType');
  }
  
  if (!['single', 'partner', 'patron'].includes(data.membershipType)) {
    throw new HttpsError('invalid-argument', 'Ungültiger membershipType');
  }
  
  logger.info(`[createJvsMember] Neue Mitgliedschaft für ${data.email} (${data.membershipType})`);
  
  try {
    // Prüfe ob bereits Mitglied
    const existingQuery = await db.collection('jvs_members').where('uid', '==', uid).limit(1).get();
    
    if (!existingQuery.empty) {
      const existingMember = existingQuery.docs[0];
      const memberData = existingMember.data() as JvsMember;
      
      // Wenn aktiv, Fehler
      if (memberData.status === 'active') {
        throw new HttpsError('already-exists', 'Es existiert bereits eine aktive Mitgliedschaft für diesen Account.');
      }
      
      // Wenn expired/cancelled, kann erneuert werden
      logger.info(`[createJvsMember] Bestehende Mitgliedschaft gefunden (Status: ${memberData.status}), wird erneuert.`);
    }
    
    const now = admin.firestore.Timestamp.now();
    const memberId = db.collection('jvs_members').doc().id;
    
    const newMember: Omit<JvsMember, 'id'> & { id: string } = {
      id: memberId,
      uid: uid,
      
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.toLowerCase().trim(),
      phone: data.phone?.trim(),
      address: data.address,
      
      membershipType: data.membershipType,
      memberSince: now,
      validUntil: getExpirationDate(),
      status: 'pending', // Wird 'active' nach Zahlung
      
      partnerId: data.partnerId,
      
      createdAt: now,
      updatedAt: now
    };
    
    // Member erstellen
    await db.collection('jvs_members').doc(memberId).set(newMember);
    
    // Versuche Player-Verknüpfung
    const playerId = await linkMemberToPlayer(memberId, uid);
    if (playerId) {
      newMember.playerId = playerId;
    }
    
    logger.info(`[createJvsMember] ✅ Member ${memberId} erstellt für ${data.email}`);
    
    return {
      success: true,
      memberId: memberId,
      playerId: playerId,
      price: MEMBERSHIP_PRICES[data.membershipType],
      status: 'pending'
    };
  } catch (error) {
    logger.error(`[createJvsMember] Fehler:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Mitgliedschaft konnte nicht erstellt werden.');
  }
});

/**
 * Prüft ob ein User JVS-Mitglied ist
 * 
 * Wird von Jasstafel für Premium-Features verwendet (z.B. Buur Analytics)
 */
interface CheckJvsMembershipData {
  targetUid?: string; // Optional: Prüfe für anderen User (nur für Admins)
}

export const checkJvsMembership = onCall<CheckJvsMembershipData>({
  region: "europe-west1"
}, async (request) => {
  // Auth Check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentifizierung erforderlich.');
  }
  
  const uid = request.data?.targetUid || request.auth.uid;
  
  // Wenn targetUid gesetzt, prüfe Admin-Berechtigung
  if (request.data?.targetUid && request.data.targetUid !== request.auth.uid) {
    const callerUserDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerUserDoc.exists || !callerUserDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Nur Admins können fremde Mitgliedschaften prüfen.');
    }
  }
  
  try {
    const memberQuery = await db.collection('jvs_members')
      .where('uid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (memberQuery.empty) {
      return {
        isMember: false,
        membershipType: null,
        validUntil: null
      };
    }
    
    const member = memberQuery.docs[0].data() as JvsMember;
    const now = admin.firestore.Timestamp.now();
    
    // Prüfe ob abgelaufen
    if (member.validUntil.toMillis() < now.toMillis()) {
      // Automatisch auf expired setzen
      await db.collection('jvs_members').doc(memberQuery.docs[0].id).update({
        status: 'expired',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        isMember: false,
        membershipType: member.membershipType,
        validUntil: member.validUntil.toDate().toISOString(),
        expired: true
      };
    }
    
    return {
      isMember: true,
      memberId: member.id,
      membershipType: member.membershipType,
      memberNumber: member.memberNumber || null,
      season: member.season || null,
      validUntil: member.validUntil.toDate().toISOString(),
      memberSince: member.memberSince.toDate().toISOString()
    };
  } catch (error) {
    logger.error(`[checkJvsMembership] Fehler:`, error);
    throw new HttpsError('internal', 'Mitgliedschaftsprüfung fehlgeschlagen.');
  }
});

/**
 * Aktiviert eine Mitgliedschaft nach erfolgreicher Zahlung
 * 
 * Wird von Stripe Webhook oder manuell aufgerufen
 */
interface ActivateMembershipData {
  memberId: string;
  paymentProvider: PaymentProvider;
  paymentId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export const activateMembership = onCall<ActivateMembershipData>({
  region: "europe-west1"
}, async (request) => {
  // Auth Check - nur für Admins oder System
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentifizierung erforderlich.');
  }
  
  const { memberId, paymentProvider, paymentId, stripeCustomerId, stripeSubscriptionId } = request.data;
  
  if (!memberId || !paymentProvider) {
    throw new HttpsError('invalid-argument', 'memberId und paymentProvider sind erforderlich.');
  }
  
  try {
    const memberRef = db.collection('jvs_members').doc(memberId);
    const memberDoc = await memberRef.get();
    
    if (!memberDoc.exists) {
      throw new HttpsError('not-found', 'Mitgliedschaft nicht gefunden.');
    }
    
    const member = memberDoc.data() as JvsMember;
    
    // Prüfe Berechtigung: Entweder Admin oder der Member selbst
    const callerUserDoc = await db.collection('users').doc(request.auth.uid).get();
    const isAdmin = callerUserDoc.exists && callerUserDoc.data()?.isAdmin === true;
    const isSelf = member.uid === request.auth.uid;
    
    if (!isAdmin && !isSelf) {
      throw new HttpsError('permission-denied', 'Keine Berechtigung.');
    }
    
    const now = admin.firestore.Timestamp.now();
    
    // Subscription erstellen
    const subscriptionId = db.collection('jvs_subscriptions').doc().id;
    const subscription: Omit<JvsSubscription, 'id'> & { id: string } = {
      id: subscriptionId,
      memberId: memberId,
      provider: paymentProvider,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: getExpirationDate(),
      amount: MEMBERSHIP_PRICES[member.membershipType],
      currency: 'CHF',
      createdAt: now,
      updatedAt: now
    };
    
    if (stripeCustomerId) subscription.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) subscription.stripeSubscriptionId = stripeSubscriptionId;
    if (paymentId && paymentProvider === 'stripe') subscription.stripePaymentIntentId = paymentId;
    if (paymentId && paymentProvider === 'twint') subscription.twintPaymentId = paymentId;
    
    // Batch: Member aktivieren + Subscription erstellen
    const batch = db.batch();
    
    batch.update(memberRef, {
      status: 'active',
      validUntil: getExpirationDate(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    batch.set(db.collection('jvs_subscriptions').doc(subscriptionId), subscription);
    
    await batch.commit();
    
    logger.info(`[activateMembership] ✅ Mitgliedschaft ${memberId} aktiviert via ${paymentProvider}`);
    
    return {
      success: true,
      memberId: memberId,
      subscriptionId: subscriptionId,
      validUntil: subscription.currentPeriodEnd.toDate().toISOString()
    };
  } catch (error) {
    logger.error(`[activateMembership] Fehler:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Aktivierung fehlgeschlagen.');
  }
});

/**
 * Holt Mitgliedschafts-Details für das JVS-Portal
 */
export const getJvsMemberDetails = onCall({
  region: "europe-west1"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentifizierung erforderlich.');
  }
  
  const uid = request.auth.uid;
  
  try {
    const memberQuery = await db.collection('jvs_members')
      .where('uid', '==', uid)
      .limit(1)
      .get();
    
    if (memberQuery.empty) {
      return {
        hasMembership: false,
        member: null,
        subscriptions: []
      };
    }
    
    const memberDoc = memberQuery.docs[0];
    const member = { ...memberDoc.data(), id: memberDoc.id } as JvsMember;
    
    // Hole Subscriptions
    const subscriptionsQuery = await db.collection('jvs_subscriptions')
      .where('memberId', '==', member.id)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    const subscriptions = subscriptionsQuery.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      currentPeriodStart: doc.data().currentPeriodStart?.toDate()?.toISOString(),
      currentPeriodEnd: doc.data().currentPeriodEnd?.toDate()?.toISOString(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString()
    }));
    
    return {
      hasMembership: true,
      member: {
        ...member,
        memberSince: member.memberSince?.toDate()?.toISOString(),
        validUntil: member.validUntil?.toDate()?.toISOString(),
        createdAt: member.createdAt?.toDate()?.toISOString()
      },
      subscriptions: subscriptions
    };
  } catch (error) {
    logger.error(`[getJvsMemberDetails] Fehler:`, error);
    throw new HttpsError('internal', 'Details konnten nicht geladen werden.');
  }
});

/**
 * Öffentliche Badge-Infos für Profile/Gruppen
 *
 * Gibt nur öffentlich sichtbare JVS-Badge-Daten zurück (keine persönlichen Daten).
 * Kein Auth erforderlich — wird für öffentliche Profile und Gruppenansichten verwendet.
 */
interface GetPublicJvsBadgesData {
  playerIds: string[];
}

export interface PublicJvsBadge {
  isMember: boolean;
  memberNumber?: number | null;
  season?: number | null;
}

export const getPublicJvsBadges = onCall<GetPublicJvsBadgesData>({
  region: "europe-west1"
}, async (request) => {
  const playerIds = request.data?.playerIds;

  if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
    return { badges: {} };
  }

  // Max 20 playerIds pro Anfrage (Missbrauchsschutz)
  const limitedIds = playerIds.slice(0, 20);

  try {
    const badges: Record<string, PublicJvsBadge> = {};

    // Firestore 'in' Query unterstützt max 30 Werte — passt
    const memberQuery = await db.collection('jvs_members')
      .where('playerId', 'in', limitedIds)
      .where('status', '==', 'active')
      .get();

    const now = admin.firestore.Timestamp.now();

    for (const doc of memberQuery.docs) {
      const member = doc.data() as JvsMember;

      // Abgelaufene überspringen
      if (member.validUntil && member.validUntil.toMillis() < now.toMillis()) {
        continue;
      }

      if (member.playerId) {
        badges[member.playerId] = {
          isMember: true,
          memberNumber: member.memberNumber || null,
          season: member.season || null
        };
      }
    }

    return { badges };
  } catch (error) {
    logger.error(`[getPublicJvsBadges] Fehler:`, error);
    throw new HttpsError('internal', 'Badge-Abfrage fehlgeschlagen.');
  }
});

