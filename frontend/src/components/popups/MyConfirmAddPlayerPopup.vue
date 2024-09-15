<template>
  <div v-if="localShow" class="popup-overlay">
    <div class="instruction-popup">
      <div class="headline instruction-content title">{{ `Hallo ${nickname}! ${title}` }}</div>
      <div class="instruction-content">
        <p class="instruction-text">
          Willkommen! Du wurdest zu jassguru.ch eingeladen. Schliesse deine Anmeldung nun ab, indem du ein sicheres Passwort eingibtst.
        </p>
        <p class="instruction-text">
          Nach diesem Schritt wirst du dich bei jassguru.ch einloggen können.
        </p>
      </div>
      <div class="instruction-content">
        <OkButton @click="closePopup" class="close-button">JETZT JASSGURU BEITRETEN!</OkButton>
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
      default: 'Du wurdest zu jassguru.ch eingeladen.'
    },
    nickname: {
      type: String,
      default: ''
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
    console.log('MyConfirmAddPlayerPopup mounted.');
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

.subtitle {
  font-size: 1.2em;
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
