<template>
  <div class="proportional-container">
    <div class="content">
      <h1>{{ title }}</h1>
      <button @click="$emit('close')">Schließen</button>
      <slot></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: "ProportionalContainer",
  props: {
    title: {
      type: String,
      required: true
    },
  },
};
</script>

<style scoped>
.proportional-container {
  background-color: red;
  width: 80vw; 
  padding-bottom: 166.67%; /* height set to 5/3 of width to maintain 3:5 aspect ratio */
  position: relative;
}

.content {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px; /* for some spacing */
  box-sizing: border-box;
  text-align: center;
}
</style>
