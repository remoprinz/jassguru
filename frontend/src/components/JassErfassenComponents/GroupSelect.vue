<template>
  <div class="group-select-container">
    <v-select
      v-model="localSelectedGroup"
      :items="userGroups"
      item-title="name"
      item-value="id"
      label="Wähle eine Gruppe"
      outlined
      @change="handleGroupSelection"
      :loading="isLoading"
      :disabled="isLoading || hasError"
      :error-messages="errorMessage"
      return-object
      class="group-select"
    ></v-select>
    <v-btn
      v-if="hasError"
      color="primary"
      @click="loadUserGroups"
      :loading="isLoading"
      class="retry-button"
    >
      Erneut versuchen
    </v-btn>
    <OkButton 
      :disabled="!isValidSelection || isLoading || hasError" 
      @click="confirmGroup"
      class="ok-button"
    >
      Bestätigen
    </OkButton>
  </div>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex';
import { fetchUserGroups } from '@/api/groupServices';
import OkButton from '@/components/common/OkButton.vue';
import { logError, logInfo } from '@/utils/logger';
import notificationMixin from '@/mixins/notificationMixin';
import { JASS_ERFASSEN_MESSAGES } from '@/constants/jassErfassenMessages';

export default {
  name: "GroupSelect",
  components: {
    OkButton
  },
  mixins: [notificationMixin],
  data() {
    return {
      userGroups: [],
      localSelectedGroup: null,
      isLoading: false,
      errorMessage: '',
      hasError: false,
    };
  },
  computed: {
    ...mapState('jassErfassen', ['selectedGroup']),
    isValidSelection() {
      return this.localSelectedGroup && this.localSelectedGroup.id;
    }
  },
  methods: {
    ...mapActions('jassErfassen', ['setGroup', 'nextStep']),
    ...mapMutations('jassErfassen', ['setSelectedGroup']),

    async loadUserGroups() {
      this.isLoading = true;
      this.errorMessage = '';
      this.hasError = false;
      try {
        this.userGroups = await fetchUserGroups();
        logInfo('loadUserGroups', 'Loaded user groups:', this.userGroups);
      } catch (error) {
        logError('loadUserGroups', error);
        this.errorMessage = JASS_ERFASSEN_MESSAGES.GROUP_SELECT.LOAD_ERROR;
        this.hasError = true;
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.LOAD_ERROR,
          color: 'error',
        });
      } finally {
        this.isLoading = false;
      }
    },

    handleGroupSelection(group) {
      logInfo('handleGroupSelection', 'Selected group:', group);
      this.localSelectedGroup = group;
      if (!group || !group.id) {
        logError('handleGroupSelection', new Error('Invalid group selected'));
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.INVALID_SELECTION,
          color: 'error',
        });
      } else {
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.SELECTED.replace('{groupName}', group.name),
          color: 'info',
        });
      }
    },

    async confirmGroup() {
      logInfo('confirmGroup', 'Confirming group, localSelectedGroup:', this.localSelectedGroup);
      if (this.isValidSelection) {
        try {
          this.isLoading = true;
          await this.setGroup(this.localSelectedGroup);
          this.nextStep();
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.CONFIRMED.replace('{groupName}', this.localSelectedGroup.name),
            color: 'success',
          });
        } catch (error) {
          logError('confirmGroup', error);
          this.showSnackbar({
            message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.ERROR,
            color: 'error',
          });
        } finally {
          this.isLoading = false;
        }
      } else {
        logError('confirmGroup', new Error('Invalid group selection'));
        this.showSnackbar({
          message: JASS_ERFASSEN_MESSAGES.GROUP_SELECT.INVALID_SELECTION,
          color: 'error',
        });
      }
    }
  },
  mounted() {
    this.loadUserGroups();
  },
  watch: {
    selectedGroup: {
      immediate: true,
      handler(newGroup) {
        if (newGroup) {
          this.localSelectedGroup = newGroup;
        }
      }
    }
  }
};
</script>

<style scoped>
.group-select-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 300px; /* Verringerte Breite */
  margin: 0 auto;
}

.group-select, .retry-button, .ok-button {
  width: 100%;
  margin-bottom: 16px;
}

@media screen and (orientation: portrait) {
  h2 {
    font-size: 8vw;
  }
}

@media screen and (orientation: landscape) {
  h2 {
    font-size: 3vw;
  }
}
</style>
