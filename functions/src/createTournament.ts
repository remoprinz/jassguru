import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

interface CreateTournamentData {
  groupId: string;
  name: string;
  participantUids: string[];        // Finale Teilnehmerliste (inkl. Ersteller), vom Client aufgelöst
  participantPlayerIds: string[];   // Korrespondierende Player-Doc-IDs (vom Client aufgelöst)
  settings: Record<string, unknown>;
  initialStatus?: 'upcoming' | 'active' | 'completed' | 'archived';
}

/**
 * Prüft, ob ein User aktuell ein aktives JVS-Mitglied ist.
 * Identische Logik wie checkJvsMembership: status=='active' UND validUntil >= jetzt
 * (Live-Ablaufprüfung, damit ein abgelaufenes, aber noch nicht "expired"-markiertes
 *  Mitglied korrekt als nicht-aktiv gilt).
 */
async function isActiveJvsMember(uid: string): Promise<boolean> {
  const memberQuery = await db.collection('jvs_members')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (memberQuery.empty) return false;

  const member = memberQuery.docs[0].data() as { validUntil?: admin.firestore.Timestamp };
  if (member.validUntil && member.validUntil.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
    return false; // abgelaufen
  }
  return true;
}

/**
 * CALLABLE: Eröffnet ein Turnier.
 *
 * Feature-Gate: Nur App-Admins (users/{uid}.isAdmin) ODER aktive JVS-Mitglieder dürfen
 * Turniere eröffnen. Die Eigentümer-Felder (createdBy, adminIds) und alle Timestamps
 * werden serverseitig gesetzt — Client-Angaben dazu werden NICHT vertraut.
 *
 * Direktes Client-Schreiben in /tournaments ist per Firestore-Rule gesperrt
 * (allow create: if false), nachdem diese Function ausgerollt und verifiziert ist.
 */
export const createTournament = onCall<CreateTournamentData>(
  { region: "europe-west1" },
  async (request: CallableRequest<CreateTournamentData>) => {
    // 🔒 Authentifizierung erforderlich
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Anmeldung erforderlich.");
    }
    const uid = request.auth.uid;

    const { groupId, name, participantUids, participantPlayerIds, settings, initialStatus } =
      request.data || ({} as CreateTournamentData);

    // Validierung
    if (!groupId || typeof groupId !== 'string') {
      throw new HttpsError("invalid-argument", "groupId fehlt oder ist ungültig.");
    }
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName.length < 3) {
      throw new HttpsError("invalid-argument", "Der Turniername muss mindestens 3 Zeichen lang sein.");
    }
    if (!Array.isArray(participantUids) || !participantUids.includes(uid)) {
      throw new HttpsError("invalid-argument", "Der Ersteller muss Teilnehmer des Turniers sein.");
    }

    // 🔒 FEATURE-GATE: App-Admin ODER aktives JVS-Mitglied
    const callerDoc = await db.collection("users").doc(uid).get();
    const isAppAdmin = callerDoc.exists && callerDoc.data()?.isAdmin === true;
    const allowed = isAppAdmin || (await isActiveJvsMember(uid));
    if (!allowed) {
      logger.warn(`createTournament: User ${uid} ist weder App-Admin noch aktives JVS-Mitglied — abgelehnt.`);
      throw new HttpsError(
        "permission-denied",
        "Turniere können nur von JVS-Mitgliedern oder Admins eröffnet werden."
      );
    }

    // Datensatz serverseitig zusammenbauen (Eigentümer-Felder/Timestamps NICHT vom Client)
    const now = admin.firestore.FieldValue.serverTimestamp();
    const newTournamentData = {
      groupId,
      name: trimmedName,
      description: '',
      logoUrl: null,
      instanceDate: null,
      status: initialStatus || 'upcoming',
      createdBy: uid,
      adminIds: [uid],
      participantUids: participantUids,
      participantPlayerIds: Array.isArray(participantPlayerIds) ? participantPlayerIds : [],
      tournamentMode: 'spontaneous',
      currentRound: 1,
      settings: settings || {},
      showInNavigation: true,
      createdAt: now,
      updatedAt: now,
      completedPasseCount: 0,
      currentActiveGameId: null,
      lastActivity: now,
    };

    const ref = await db.collection("tournaments").add(newTournamentData);
    logger.info(
      `createTournament: Turnier ${ref.id} von ${uid} erstellt (isAppAdmin=${isAppAdmin}).`
    );
    return { tournamentId: ref.id };
  }
);
