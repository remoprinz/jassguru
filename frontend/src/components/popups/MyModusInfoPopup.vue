<template>
  <div v-if="localShow" class="popup-overlay">
    <div class="instruction-popup">
      <div class="headline instruction-content title">{{ title }}</div>
      <div class="instruction-content">
        <p class="instruction-text">
          Erklärung:
        </p>
        <ul class="instruction-text">
          <li><strong>Jassgruppe:</strong> Führe laufend Statistik mit deiner Jassgruppe.</li>
          <li><strong>Turnier:</strong> Statistik in einem geschlossenen Event.</li>
          <li><strong>Einzelspiel:</strong> Jassrunde einfach so, ohne Jassgruppe oder Turnier.</li>
          <li><strong>Liga:</strong> Zählt zur Schweizer Schieber-Liga.</li>
        </ul>
      </div>
      <div class="instruction-content">
        <OkButton @click="closePopup" class="close-button">Schließen</OkButton>
      </div>
    </div>
  </div>
</template>

<script>
import OkButton from '../common/OkButton.vue';

export default {
  components: {
    OkButton
  },
  props: {
    show: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: 'Spielmodus Informationen'
    }
  },
  watch: {
    show(newVal) {
      this.localShow = newVal;
    }
  },
  data() {
    return {
      localShow: this.show
    };
  },
  methods: {
    closePopup() {
      this.$emit('update:show', false);
    }
  },
  mounted() {
    console.log('MyModusInfoPopup mounted.');
  }
};
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0; /* Set to 0 for full-screen overlay */
  left: 0;
  width: 100%;
  height: 100%; /* Set to 100% for full-screen overlay */
  background-color: rgba(0, 0, 0, 0.7); /* Dark background */
  display: flex;
  align-items: flex-start; /* Aligns popup at the top */
  justify-content: center;
  z-index: 1000;
}

.instruction-popup {
  z-index: 1001;
  position: relative;
  top: 20%; /* Moves the actual popup down */
  width: 80%;
  max-width: 400px;
  min-width: 200px;
  background-color: #333;  /* Dark gray background */
  padding: 2em;
  border-radius: 10px;
  box-sizing: border-box;
  overflow: auto;
  margin: 10px;
  color: white; /* Text color */
}

.title {
  font-size: 1.5em;
  margin-bottom: 1em;
  text-align: left;
}

.instruction-content {
  margin-bottom: 1em;
  text-align: left;
}

.instruction-text {
  text-align: left;
  line-height: 1.5em;
}

.instruction-text ul {
  padding-left: 1.2em;
}

.instruction-text li {
  margin-bottom: 0.5em;
}

.close-button {
  background-color: #388E3C;
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px 20px;
  cursor: pointer;
}
</style>
