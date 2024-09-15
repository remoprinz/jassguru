<template>
  <div class="main-events">
    <div class="team-events">
      <h2>{{ teamName }}</h2>
      <div class="buttons-container">
        <button
          class="event-button berg"
          :class="{ selected: selectedBerg }"
          @click="selectBerg"
        >
          BERG
        </button>
        <button
          class="event-button sieg"
          :class="{ selected: selectedSieg }"
          @click="selectSieg"
        >
          SIEG
        </button>
      </div>
      <div class="matsch-container">
        <button class="event-button matsch" @click="incrementMatsch">
          MATSCH
        </button>
        <span class="matsch-counter">{{ matschCount }}</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    teamName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      selectedBerg: false,
      selectedSieg: false,
      matschCount: 0,
    };
  },
  methods: {
    selectBerg() {
      if (!this.selectedSieg) {
        this.selectedBerg = !this.selectedBerg;
      }
      // Logik zum Speichern von BERG in der Datenbank oder im Zwischenspeicher
    },
    selectSieg() {
      if (!this.selectedBerg) {
        this.selectedSieg = !this.selectedSieg;
      }
      // Logik zum Speichern von SIEG in der Datenbank oder im Zwischenspeicher
    },
    incrementMatsch() {
      this.matschCount++;
      // Logik zum Speichern von MATSCH in der Datenbank oder im Zwischenspeicher
    },
    reset() {
      this.selectedBerg = false;
      this.selectedSieg = false;
      this.matschCount = 0;
    },
  },
};
</script>

<!-- Styles bleiben unverändert -->


<!-- Styles bleiben unverändert -->


<style scoped>
.main-events {
  display: flex;
  flex-direction: column; /* Änderung hier: von 'row' zu 'column' */
  align-items: center; /* Änderung hier: füge 'align-items' hinzu */
  margin-bottom: 20px;
}

.team-events {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px; /* Änderung hier: füge 'margin-bottom' hinzu */
}

.buttons-container {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.event-button {
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 18px;
  font-weight: bold;
}

.event-button.selected {
  background-color: #4caf50;
}

.event-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.event-button.berg {
  margin-right: 20px;
}

.matsch-container {
  display: flex;
  align-items: center;
}

.matsch-counter {
  font-size: 24px;
  font-weight: bold;
  margin-left: 10px;
}
</style>