import type {JassSession} from "../types/jass";

// Interface für den Storage-Adapter
export interface StorageAdapter {
  saveSession(data: JassSession): Promise<void>;
  loadSession(id: string): Promise<JassSession>;
  listSessions(): Promise<JassSession[]>;
}

// Implementierung für localStorage
export class LocalStorageAdapter implements StorageAdapter {
  private readonly STORAGE_KEY = "jass_sessions";

  private getStorageKey(id: string): string {
    return `${this.STORAGE_KEY}_${id}`;
  }

  async saveSession(data: JassSession): Promise<void> {
    try {
      const key = this.getStorageKey(data.id);
      await localStorage.setItem(key, JSON.stringify(data));

      // Update session list
      const sessions = await this.listSessions();
      if (!sessions.find((s) => s.id === data.id)) {
        sessions.push(data);
        await localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Session:", error);
      throw error;
    }
  }

  async loadSession(id: string): Promise<JassSession> {
    const data = localStorage.getItem(this.getStorageKey(id));
    if (!data) throw new Error(`Session ${id} nicht gefunden`);
    return JSON.parse(data);
  }

  async listSessions(): Promise<JassSession[]> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Fehler beim Laden der Sessions:", error);
      return [];
    }
  }
}

// Singleton-Instanz für die Anwendung
export const jassStorage = new LocalStorageAdapter();
