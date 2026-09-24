<script setup lang="ts" generic="T">
import { computed, ref } from 'vue';
import { defaultPageSize, ui } from '@/configuration';

const { items } = defineProps<{
  items: T[];
}>();

defineSlots<{
  default(props: { item: T }): unknown;
}>();

const currentPage = ref(1);
const pageSize = ref(defaultPageSize);

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return items.slice(start, start + pageSize.value);
});
</script>

<template>
  <li v-for="item of paginatedItems" :key="String(item)" class="ml-4 pl-2">
    <slot :item="item" />
  </li>
  <li v-if="items.length > pageSize">
    <el-pagination class="mt-2" layout="sizes, prev, pager, next" :total="items.length"
      :page-sizes="ui.pagination.pageSizes" v-model:page-size="pageSize" v-model:current-page="currentPage"
      @size-change="currentPage = 1" />
  </li>
</template>
