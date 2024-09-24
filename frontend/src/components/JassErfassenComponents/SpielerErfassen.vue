<template>
  <div class="spieler-erfassen">
    <div v-if="selectedGroup" class="content-container">
      <div class="input-container">
        <h3 class="group-name">{{ selectedGroup.name }}</h3>
        <v-progress-circular
          v-if="istLadend"
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
                  :items="availablePlayers"
                  item-title="nickname"
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
      </div>
    </div>
    <div v-else class="content-container">
      <p>Bitte wählen Sie zuerst eine Gruppe aus.</p>
    </div>
    <a 
      @click="resetPlayerSelection" 
      class="reset-link"
    >
      Spielerauswahl zurücksetzen
    </a>
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
import { logError, logInfo, logDebug } from '@/utils/logger';
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
      istLadend: false,
    };
  },
  computed: {
    ...mapState('jassErfassen', ['selectedGroup', 'groupPlayers', 'selectedPlayers']),
    ...mapGetters('jassErfassen', ['allPlayersSelected']),
    
    availablePlayers() {
      return this.groupPlayers.filter(player => 
        !Object.values(this.selectedPlayers).some(selected => selected && selected.id === player.id)
      );
    },
  },
  methods: {
    ...mapActions('jassErfassen', ['setSelectedPlayer', 'removeSelectedPlayer', 'validateSelectedPlayers', 'fetchGroupPlayers', 'resetSelectedPlayers', 'addNewPlayerAndSelect']),
    
    handlePlayerSelection(slot, player) {
      this.setSelectedPlayer({ slot, player });
    },
    
    async confirmPlayerSelection() {
      if (this.allPlayersSelected) {
        try {
          await this.validateSelectedPlayers();
          await this.$store.dispatch('jassErfassen/setFinalPlayers', this.selectedPlayers);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.CONFIRMED,
            color: 'success'
          });
          await this.$store.dispatch('jassErfassen/nextStep');
        } catch (error) {
          this.showSnackbar({
            message: error.message || JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.ERROR,
            color: 'error'
          });
        }
      }
    },
    
    resetPlayerSelection() {
      this.resetSelectedPlayers();
      this.showSnackbar({
        message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.RESET,
        color: 'info'
      });
    },
    
    async fetchPlayersIfNeeded() {
      if (this.selectedGroup && this.groupPlayers.length === 0) {
        this.istLadend = true;
        try {
          await this.fetchGroupPlayers(this.selectedGroup.id);
        } catch (error) {
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.PLAYER_SELECT.LOAD_ERROR,
            color: 'error',
          });
        } finally {
          this.istLadend = false;
        }
      }
    },

    async handleNewPlayer(newPlayer) {
      if (!newPlayer || typeof newPlayer !== 'object' || !('id' in newPlayer) || !('nickname' in newPlayer)) {
        logError('handleNewPlayer', new Error('Invalid new player object'));
        return;
      }

      try {
        await this.addNewPlayerAndSelect(newPlayer);
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
        logInfo('SpielerErfassen', 'Ausgewählte Spieler aktualisiert:', newPlayers);
        if (Object.values(newPlayers).filter(Boolean).length === 4) {
          logInfo('SpielerErfassen', 'Alle vier Spieler ausgewählt, bereit für nächsten Schritt');
        }
      },
      deep: true
    }
  },
};
</script>

<style scoped>
.spieler-erfassen {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.content-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.input-container {
  width: 180%;
  max-width: 290px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.group-name {
  text-align: center;
  margin-bottom: 0px;
  font-size: 1.2em;
  margin-top: 50px; /* Verschiebt den Gruppennamen etwas nach unten */
}

.teams-container {
  width: 100%;
}

.team {
  margin-bottom: -20px;
}

.team-title {
  text-align: center;
  margin-bottom: 10px;
  font-size: 1.1em;
}

.players-container {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.player-select {
  width: calc(50% - 4px);
}

.confirm-button {
  width: 100%;
  margin-top: 30px; /* Verringert den Abstand zum OK-Button */
}

.reset-link {
  margin-top: 40px;
  font-size: 0.9em;
  text-decoration: underline;
  color: inherit;
  cursor: pointer;
}

:deep(.v-select) {
  width: 100%;
}

:deep(.v-select__selections) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media screen and (orientation: landscape) {
  .input-container {
    padding-top: 8px;
    transform: scale(0.9);
    transform-origin: top center;
  }

  .confirm-button {
    margin-top: 4px; /* Noch geringerer Abstand im Landscape-Modus */
  }
}
</style>