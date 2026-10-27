<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getEntityUrl } from '@/lib/tools';
import type { EntityType } from '@/services/api';

const { items, currentId } = defineProps<{
  items: EntityType[];
  currentId?: string;
}>();

const { t } = useI18n();

const columns = computed(() => [
  ...(items.some((item) => item.identifiers?.shortIdentifier)
    ? [
        {
          label: t('common.identifier'),
          width: 140,
          text: (item: EntityType) => item.identifiers?.shortIdentifier,
        },
      ]
    : []),
  { label: t('common.title'), minWidth: 120, text: (item: EntityType) => item.name || item.id },
]);

const rowClassName = ({ row }: { row: EntityType }) => (row.id === currentId ? 'current-member' : '');
</script>

<template>
  <el-table :data="items" stripe style="width: 100%" class="member-table" :row-class-name="rowClassName">
    <el-table-column v-for="column of columns" :key="column.label" :label="column.label" :width="column.width"
      :min-width="column.minWidth">
      <template #default="{ row }">
        <span v-if="row.id === currentId">{{ column.text(row) }}</span>
        <router-link v-else :to="getEntityUrl(row)" class="text-blue-600 hover:text-blue-800">
          {{ column.text(row) }}
        </router-link>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
/* Element Plus defaults el-table to 14px, smaller than the surrounding metadata. */
.member-table :deep(.cell) {
  font-size: 1rem;
}

.member-table :deep(.current-member) {
  font-weight: bold;
}
</style>
