import { apiService } from './apiConfig';

// Funktion zur Erstellung einer neuen Gruppe
export const createGroup = async (groupName) => {
  try {
    // Senden einer POST-Anfrage an den Server zur Erstellung einer neuen Gruppe
    const response = await apiService.post('/groups/', { name: groupName });
    // Rückgabe der Daten der erstellten Gruppe
    return response.data;
  } catch (error) {
    // Fehlerbehandlung und Ausgabe der Fehlermeldung
    console.error('Error in createGroup:', error);
    throw error;
  }
};

// Funktion zum Abrufen der Gruppen eines Benutzers
export const fetchUserGroups = async () => {
  try {
    // Senden einer GET-Anfrage an den Server zum Abrufen der Gruppen eines Benutzers
    const response = await apiService.get('/groups/user_groups');
    // Transformieren der empfangenen Daten, Konvertierung der ID zu einem String
    return response.data.map(group => ({
      id: group.id.toString(), // Konvertieren der ID zu einem String
      name: group.name
    }));
  } catch (error) {
    // Fehlerbehandlung und Ausgabe der Fehlermeldung
    console.error("Error fetching user groups:", error);
    throw error;
  }
};

// Funktion zur Aktualisierung der Administratoren einer Gruppe
export const updateGroupAdmins = async (groupId, adminIds) => {
  try {
    // Senden einer PUT-Anfrage an den Server zur Aktualisierung der Gruppenadministratoren
    const response = await apiService.put(`/groups/${groupId}/admins`, { admin_ids: adminIds });
    // Rückgabe der aktualisierten Daten der Gruppe
    return response.data;
  } catch (error) {
    // Fehlerbehandlung und Ausgabe der Fehlermeldung
    console.error('Error in updateGroupAdmins:', error);
    throw error;
  }
};
