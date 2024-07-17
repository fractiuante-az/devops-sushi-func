<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
const timelineItems = ref({})

onMounted(async () => {
  try {
    timelineItems.value = await (await fetch('/api/timeline')).json()
  } catch (error) {
    console.error(error)
  }
})
</script>
<template>
  <RouterView />
</template>
