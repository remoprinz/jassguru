<!-- SpielErfassen.vue -->
<template>
  <div class="spiel-erfassen">
    <OkButton 
      @click="confirmPlayerSelection"
      class="ok-button"
    >
      Spielerauswahl bestätigen
    </OkButton>
  </div>
</template>

<script>
import { mapActions } from 'vuex';
import OkButton from '@/components/common/OkButton.vue';

export default {
  name: 'SpielErfassen',
  components: {
    OkButton
  },
  methods: {
    ...mapActions('jassErfassen', ['nextStep']),
    
    confirmPlayerSelection() {
      this.nextStep();
    }
  }
}
</script>

<style scoped>
.spiel-erfassen {
  display: flex;
  justify-content: center;
  width: 100%;
}

.ok-button {
  width: 100%;
  max-width: 300px;
}
</style>
