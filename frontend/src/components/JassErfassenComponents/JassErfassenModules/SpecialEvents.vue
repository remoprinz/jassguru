<template>
  <v-expansion-panels>
    <v-expansion-panel>
      <v-expansion-panel-header>SpecialEvents</v-expansion-panel-header>
      <v-expansion-panel-content>
        <div class="special-event">
          <button @click="handleSchniiderClick" :class="{ 'green': schniiderClicked }">SCHNIIDER</button>
        </div>
        <div class="special-event">
          <button @click="handleKontermatschClick" class="kontermatsch-button">KONTERMATSCH</button>
          <span class="kontermatsch-score">{{ kontermatschScore }}</span>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script>
export default {
  name: "SpecialEvents",
  data() {
    return {
      schniiderClicked: false,
      kontermatschScore: 0,
    };
  },
  methods: {
    handleSchniiderClick() {
      // ...
    },
    handleKontermatschClick() {
      // ...
    },
    reset() {
      this.schniiderClicked = false;
      this.kontermatschScore = 0;
    },
  },
};
</script>


<style scoped>
.green {
  background-color: green;
}

.special-event {
  margin-bottom: 10px;
}

.kontermatsch-button {
  margin-right: 10px;
}

.kontermatsch-score {
  font-size: 20px;
  font-weight: bold;
}
</style>
