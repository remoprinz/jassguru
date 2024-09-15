<template>
  <ProportionalContainer 
    title="Testseite" 
    :bgImage="require('@/assets/images/Schiefertafel.png')"
    @close="goBack"
  >
    <!-- Sie können hier Ihre Formular- oder sonstige Komponenten einfügen -->
    <p>Dies ist ein Test der ProportionalContainer-Komponente.</p>
  </ProportionalContainer>
</template>

<script>
import ProportionalContainer from '../common/ProportionalContainer.vue'

export default {
  components: {
    ProportionalContainer
  },
  methods: {
    goBack() {
      this.$router.back(); // geht zurück zur vorherigen Seite
    },
  },
};
</script>
