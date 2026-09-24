<script setup lang="ts">
import { usePagination } from '@/composables/usePagination';
import { ui } from '@/configuration';

const { items } = defineProps<{
  items: string[];
}>();

const { currentPage, pageSize, pageItems } = usePagination(() => items);
</script>

<template>
  <li v-for="item of pageItems" :key="item" class="ml-4 pl-2">
    <slot :item="item" />
  </li>
  <li v-if="items.length > pageSize">
    <el-pagination class="mt-2" layout="sizes, prev, pager, next" :total="items.length"
      :page-sizes="ui.pagination.pageSizes" v-model:page-size="pageSize" v-model:current-page="currentPage"
      @size-change="currentPage = 1" />
  </li>
</template>
