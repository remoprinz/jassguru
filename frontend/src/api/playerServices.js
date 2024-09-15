// playerServices.js

import { apiService } from './apiConfig';
import { auth } from '../firebaseInit';

// Fehlerbehandlung für API-Anfragen
const handleApiError = (error) => {
    let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
    let errorCode = 500;

    if (error.response) {
        errorMessage = error.response.data.message || errorMessage;
        errorCode = error.response.status;
    } else if (error.request) {
        errorMessage = 'Keine Antwort vom Server erhalten.';
    } else {
        errorMessage = error.message;
    }

    return {
        message: errorMessage,
        status: errorCode,
    };
};

// Spieler anhand der ID abrufen
export const getPlayerById = async (playerId) => {
    try {
        const response = await apiService.get(`/players/${playerId}`);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// Spieler erstellen
export const createPlayer = async (playerData) => {
    try {
        const response = await apiService.post('/players', playerData);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// Spieler aktualisieren
export const updatePlayer = async (playerId, playerData) => {
    try {
        const response = await apiService.put(`/players/${playerId}`, playerData);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// Spieler löschen
export const deletePlayer = async (playerId) => {
    try {
        const response = await apiService.delete(`/players/${playerId}`);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// Gruppen für einen Spieler abrufen
export const getGroupsForPlayer = async () => {
    console.log('Fetching groups for player');
    try {
        if (!auth.currentUser) {
            throw new Error("User must be authenticated to fetch groups.");
        }
        const url = `/groups/user_groups`;
        console.log('Request URL:', url);
        const response = await apiService.get(url);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// Funktion zur Suche nach Spielern
export const searchPlayers = async (searchTerm) => {
    try {
        const response = await apiService.get(`/players/search?term=${searchTerm}`);
        return response.data;
    } catch (error) {
        console.error('Error searching players:', error);
        throw error;
    }
};

// Funktion zum Hinzufügen eines Spielers zu einer Gruppe
export const addPlayerToGroup = async (groupId, playerId) => {
    try {
        const response = await apiService.post(`/groups/${groupId}/players`, { playerId });
        return response.data;
    } catch (error) {
        console.error('Error adding player to group:', error);
        throw error;
    }
};
