<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { defaultPageSize } from '@/configuration';

const { t } = useI18n();

const { items, variant = 'inline' } = defineProps<{
  items: string[];
  variant?: 'inline' | 'list';
}>();

const expanded = ref(false);
const hiddenCount = computed(() => Math.max(items.length - defaultPageSize, 0));
const visible = computed(() => (expanded.value ? items : items.slice(0, defaultPageSize)));
const toggleLabel = computed(() =>
  expanded.value ? t('common.showLess') : t('common.showMore', { n: hiddenCount.value }),
);
</script>

<template>
  <template v-if="variant === 'list'">
    <li v-for="item in visible" :key="item" class="ml-4 pl-2">{{ item }}</li>
  </template>
  <p v-else class="inline">{{ visible.join(', ') }}</p>

  <component :is="variant === 'list' ? 'li' : 'span'" v-if="hiddenCount" :class="variant === 'list' ? 'ml-4 pl-2' : 'ml-1'">
    <el-button link type="primary" size="small" @click="expanded = !expanded">{{ toggleLabel }}</el-button>
  </component>
</template>
