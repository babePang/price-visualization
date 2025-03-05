<script setup lang="ts">
import { ref } from "vue";
// const size = ref("default");
const size = "mini";
</script>

<template>
  <el-config-provider :size="size">
    <router-view />
  </el-config-provider>
</template>

<style lang="scss">
html,
body,
#app {
  width: 100%;
  height: 100%;
}
</style>
