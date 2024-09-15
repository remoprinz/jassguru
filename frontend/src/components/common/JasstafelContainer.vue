<template>
  <div class="Jasstafel-container" :style="containerStyle">
    <svg :viewBox="viewBox" class="svg"></svg>
    <div class="content">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';

export default {
  name: "JasstafelContainer",
  props: {
    title: {
      type: String,
      required: false
    },
    bgImage: {
      type: String,
      required: true,
    },
    hideImageInLandscape: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isLandscape = ref(window.innerWidth > window.innerHeight);
    const viewBox = ref(isLandscape.value ? '0 0 4 3' : '0 0 3 4');

    const containerStyle = computed(() => {
      if (isLandscape.value && props.hideImageInLandscape) {
        return 'background: none;';
      }
      return `background: url(${props.bgImage}) no-repeat center center; background-size: contain;`;
    });

    watch(isLandscape, (newValue) => {
      viewBox.value = newValue ? '0 0 4 3' : '0 0 3 4';
    }, { immediate: true });

    const checkOrientation = () => {
      isLandscape.value = window.innerWidth > window.innerHeight;
    };

    onMounted(() => {
      window.addEventListener('resize', checkOrientation);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('resize', checkOrientation);
    });

    return {
      isLandscape,
      viewBox,
      containerStyle,
      checkOrientation,
    };
  }
};
</script>

<style scoped>
.Jasstafel-container {
  position: relative;
  width: 80vw;
  max-width: 100vh;
  margin: 0 auto;
}

.svg {
  width: 100%;
  height: auto;
  visibility: hidden;
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
  padding: 10px;
  box-sizing: border-box;
}
</style>