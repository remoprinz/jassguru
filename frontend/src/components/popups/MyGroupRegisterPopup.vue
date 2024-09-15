<template>
  <div v-if="localShow" class="popup-overlay">
    <div class="instruction-popup">
      <div class="headline instruction-content title">{{ title }}</div>
      <div class="instruction-content">
        <p class="instruction-text">
          Überlege dir einen guten Namen für deine Jassgruppe, registriere sie und lade deine Jassfreunde dazu ein.
        </p>
        <p class="instruction-text">
          Keine Sorge, ihr könnt den Namen später jederzeit wechseln.
        </p>
      </div>
      <div class="instruction-content">
        <OkButton @click="closePopup" class="close-button">JETZT GRUPPE ERSTELLEN</OkButton>
      </div>
    </div>
  </div>
</template>

<script>
import OkButton from '@/components/common/OkButton.vue';

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
      default: 'Gruppenregistrierungsanleitung'
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
  }
};
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
}

.instruction-popup {
  z-index: 1001;
  position: relative;
  top: 20%;
  width: 80%;
  max-width: 400px;
  min-width: 200px;
  background-color: #333;
  padding: 2em;
  border-radius: 10px;
  box-sizing: border-box;
  overflow: auto;
  margin: 10px;
  color: white;
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