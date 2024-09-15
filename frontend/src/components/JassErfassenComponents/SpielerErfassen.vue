<template>
  <div class="spieler-erfassen">
    <div v-if="selectedGroup" class="content-container">
      <h3 class="centered-title">{{ selectedGroup.name }}</h3>
      <v-progress-circular
        v-if="isLoading"
        indeterminate
        color="primary"
        class="loader"
      ></v-progress-circular>
      <div v-else class="teams-container">
        <div v-for="(team, teamIndex) in [1, 2]" :key="teamIndex" class="team">
          <h3 class="team-title">Team {{ team }}</h3>
          <div class="players-container">
            <div v-for="player in 2" :key="`team${team}player${player}`" class="player-select">
              <v-select
                v-model="selectedPlayers[`team${team}player${player}`]"
                :items="availablePlayersForSlot(`team${team}player${player}`)"
                item-text="nickname"
                item-value="id"
                :label="`Spieler ${teamIndex * 2 + player}`"
                return-object
                dense
                outlined
                @change="handlePlayerSelection(`team${team}player${player}`, $event)"
              >
                <template v-slot:append-item>
                  <v-list-item @click="goToAddPlayer">
                    <v-list-item-title>Neuer Spieler hinzufügen</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="searchExistingPlayer">
                    <v-list-item-title>Existierenden Spieler suchen</v-list-item-title>
                  </v-list-item>
                </template>
              </v-select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="content-container">
      <p>Bitte wählen Sie zuerst eine Gruppe aus.</p>
    </div>
    <div class="button-container">
      <v-btn 
        @click="confirmPlayerSelection" 
        color="success" 
        class="confirm-button" 
        :disabled="!allPlayersSelected"
        rounded
        block
      >
        Spielerauswahl bestätigen
      </v-btn>
      <a 
        @click="resetPlayerSelection" 
        class="reset-link"
      >
        Spielerauswahl zurücksetzen
      </a>
    </div>
    <SearchDialog ref="searchDialog" />
    <PlayerSelectDialog ref="playerSelectionDialog" />
  </div>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex';
import { searchPlayers } from '@/api/playerServices';
import SearchDialog from '@/components/player/SearchDialog.vue';
import PlayerSelectDialog from '@/components/player/PlayerSelectDialog.vue';
import notificationMixin from '@/mixins/notificationMixin';
import { logError, logInfo, logDebug, logWarning } from '@/utils/logger';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';

export default {
  name: 'SpielerErfassen',
  components: {
    SearchDialog,
    PlayerSelectDialog,
  },
  mixins: [notificationMixin],
  data() {
    return {
      isLoading: false,
    };
  },
  computed: {
    ...mapState('jassErfassen', ['selectedGroup', 'groupPlayers']),
    ...mapGetters('jassErfassen', ['allPlayersSelected']),
    selectedPlayers: {
      get() {
        return this.$store.state.jassErfassen.selectedPlayers;
      },
      set(newValue) {
        this.$store.commit('jassErfassen/SET_SELECTED_PLAYERS', newValue);
      }
    },
    
    availablePlayersForSlot() {
      return (slot) => {
        const currentSelectedPlayers = Object.entries(this.selectedPlayers)
          .filter(([currentSlot, player]) => currentSlot !== slot && player !== null)
          .map(([, player]) => player);
        
        return this.groupPlayers.filter(player => 
          !currentSelectedPlayers.some(selectedPlayer => selectedPlayer.id === player.id)
        );
      };
    }
  },
  methods: {
    ...mapActions('jassErfassen', ['setSelectedPlayer', 'removeSelectedPlayer', 'validateSelectedPlayers']),
    
    handlePlayerSelection(slot, player) {
      if (player) {
        this.setSelectedPlayer({ slot, player: { id: player.id, nickname: player.nickname } });
        logInfo(`Spieler ${player.nickname} für Slot ${slot} ausgewählt`);
      } else {
        this.removeSelectedPlayer(slot);
        logInfo(`Spieler aus Slot ${slot} entfernt`);
      }
      logDebug('Updated selectedPlayers:', this.selectedPlayers);
    },
    
    async confirmPlayerSelection() {
      logDebug('Bestätigung der Spielerauswahl:', this.selectedPlayers);
      if (this.allPlayersSelected) {
        try {
          await this.validateSelectedPlayers();
          logInfo('SpielerErfassen', 'Spielerauswahl erfolgreich abgeschlossen', this.selectedPlayers);
          this.$emit('next-step');
        } catch (error) {
          logError('SpielerErfassen', 'Fehler bei der Spielerauswahl', error);
          this.showSnackbar({
            message: error.message,
            color: 'error'
          });
        }
      } else {
        logWarning('SpielerErfassen', 'Nicht alle Spieler ausgewählt');
        this.showSnackbar({
          message: 'Bitte wählen Sie alle Spieler aus.',
          color: 'warning'
        });
      }
    },
    
    resetPlayerSelection() {
      this.$store.dispatch('jassErfassen/resetSelectedPlayers');
      this.showSnackbar({
        message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.RESET,
        color: 'info'
      });
    },
    
    async fetchPlayersIfNeeded() {
      if (!this.selectedGroup || !this.selectedGroup.id) {
        logError('fetchPlayersIfNeeded', new Error('No valid group selected'));
        return;
      }

      if (this.groupPlayers.length === 0) {
        logInfo('fetchPlayersIfNeeded', 'Fetching players for group:', this.selectedGroup.id);
        this.isLoading = true;
        try {
          await this.$store.dispatch('jassErfassen/fetchGroupPlayers', this.selectedGroup.id);
          logInfo('fetchPlayersIfNeeded', 'Players fetched successfully');
        } catch (error) {
          logError('fetchPlayersIfNeeded', error);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.LOAD_ERROR,
            color: 'error',
          });
        } finally {
          this.isLoading = false;
        }
      }
    },

    async handleNewPlayer(newPlayer) {
      if (!newPlayer || typeof newPlayer !== 'object' || !('id' in newPlayer) || !('nickname' in newPlayer)) {
        logError('handleNewPlayer', new Error('Invalid new player object'));
        return;
      }

      try {
        await this.$store.dispatch('jassErfassen/addNewPlayerAndSelect', newPlayer);
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.PLAYER_ADDED.replace('{playerName}', newPlayer.nickname).replace('{position}', 'zur Gruppe'),
          color: 'success',
        });
      } catch (error) {
        logError('handleNewPlayer', error);
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.ERROR,
          color: 'error',
        });
      }
    },

    goToAddPlayer() {
      if (!this.selectedGroup || !this.selectedGroup.id) {
        logError('goToAddPlayer', new Error('No valid group selected'));
        return;
      }

      this.$router.push({
        path: '/add_player',
        query: {
          returnTo: 'jass_erfassen',
          groupId: this.selectedGroup.id,
        },
      });
    },

    async searchExistingPlayer() {
      try {
        const searchTerm = await this.$refs.searchDialog.open();
        if (!searchTerm) return;

        const players = await searchPlayers(searchTerm);
        if (players.length === 0) {
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.NOT_FOUND,
            color: 'warning',
          });
          return;
        }

        const filteredPlayers = players.filter(
          player => !this.groupPlayers.some(gp => gp.id === player.id)
        );

        if (filteredPlayers.length > 0) {
          const selectedPlayer = await this.$refs.playerSelectionDialog.open(filteredPlayers);
          if (selectedPlayer) {
            await this.handleNewPlayer(selectedPlayer);
          }
        } else {
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.NO_MATCHING_PLAYER,
            color: 'warning',
          });
        }
      } catch (error) {
        logError('searchExistingPlayer', error);
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.ERROR,
          color: 'error',
        });
      }
    },
  },
  created() {
    this.fetchPlayersIfNeeded();
    const newPlayerNickname = this.$route.query.newPlayer;
    if (newPlayerNickname) {
      const newPlayer = this.groupPlayers.find(p => p.nickname === newPlayerNickname);
      if (newPlayer) {
        this.handleNewPlayer(newPlayer);
      }
    }
  },
  watch: {
    selectedGroup: {
      immediate: true,
      handler(newGroup) {
        if (newGroup) {
          this.fetchPlayersIfNeeded();
        }
      },
    },
    groupPlayers: {
      handler(newPlayers) {
        logInfo('SpielerErfassen', 'Group players updated:', newPlayers);
      },
      deep: true,
    },
    selectedPlayers: {
      handler(newPlayers) {
        logDebug('SpielerErfassen: selectedPlayers updated', newPlayers);
      },
      deep: true
    }
  },
};
</script>

<style scoped>
.spieler-erfassen {
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
}

.team-title {
  text-align: center;
  margin-bottom: 15px;
  font-size: 1.1em; /* Leicht verkleinerte Schriftgröße */
}

.players-container {
  display: flex;
  justify-content: space-between;
  gap: 10px; /* Reduzierter Abstand zwischen den Auswahlfeldern */
  margin-bottom: 20px;
}

.player-select {
  width: 100%; /* Leicht erhöhte Breite */
}

.player-label {
  font-size: 0.9em;
  margin-bottom: 5px;
}

.button-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 30px; /* Erhöhter Abstand zum letzten Auswahlfeld */
}

.confirm-button {
  width: 100%;
}

.reset-link {
  margin-top: 15px;
  font-size: 0.9em;
  text-decoration: underline;
  color: inherit;
  cursor: pointer;
}

/* Zusätzliche Stile für breitere Eingabefelder */
:deep(.v-select) {
  width: 100%;
}

:deep(.v-select__selections) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.v-select__selection) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Optional: Reduzieren Sie den Innenabstand der Eingabefelder */
:deep(.v-select .v-input__slot) {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

/* Optional: Verkleinern Sie die Schriftgröße innerhalb der Eingabefelder */
:deep(.v-select .v-select__selection) {
  font-size: 0.9em;
}

/* Neuer Stil für den zentrierten Titel */
.centered-title {
  text-align: center;
  width: 100%;
  margin-bottom: 20px;
  font-size: 1.5em;
}
</style>
