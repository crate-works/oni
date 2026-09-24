<script setup lang="ts">
import { computed } from 'vue';

import { groupMediaTypesByIcon } from '@/lib/tools';

const { mediaTypes } = defineProps<{ mediaTypes: string[] }>();

const groups = computed(() => groupMediaTypesByIcon(mediaTypes));
</script>

<template>
  <span v-for="group of groups" :key="group.icon" class="p-1 m-1">
    <el-tooltip effect="light" :content="`File Format: ${group.mediaTypes.join(', ')}`" placement="bottom">
      <font-awesome-icon :icon="['fa-solid', group.icon]" size="2x" style="color: rgba(0,0,0,0.55);" />
    </el-tooltip>
  </span>
</template>
