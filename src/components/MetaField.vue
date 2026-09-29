<script setup lang="ts">
import { computed } from 'vue';
import FieldHelperCard from '@/components/cards/FieldHelperCard.vue';
import ElasticField from '@/components/ElasticField.vue';
import { usePagination } from '@/composables/usePagination';
import { ui } from '@/configuration';
import { startCase } from '@/lib/metadata';
import { first } from '@/lib/tools';
import type { RoCrate } from '@/services/api';

const { paginatedMeta } = ui.main;

const { meta, isExpand } = defineProps<{
  meta: { name: string; data: RoCrate[keyof RoCrate] };
  isExpand?: boolean;
}>();

const name = computed(() => meta.name);
const data = computed(() => meta.data);

const sortedData = computed(() => {
  if (Array.isArray(meta.data) && paginatedMeta.includes(meta.name)) {
    return [...(meta.data as { name: string | string[] }[])].sort((a, b) => {
      const aName = String(first(a.name) || '').toLowerCase();
      const bName = String(first(b.name) || '').toLowerCase();
      return aName.localeCompare(bName);
    });
  }

  return meta.data;
});

const { currentPage, pageSize, pageItems } = usePagination(() =>
  Array.isArray(sortedData.value) ? (sortedData.value as unknown[]) : [],
);
</script>

<template>
  <el-row :gutter="10" class="py-2">
    <template v-if="isExpand">
      <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="24">
        <el-row v-for="(value, key) in data">
          <el-col :xs="24" :sm="24" :md="7" :lg="7" :xl="7">{{ startCase(String(key)) }}</el-col>
          <el-col :xs="24" :sm="24" :md="17" :lg="17" :xl="17">
            <ElasticField :field="value" :title="String(key)" />
          </el-col>
        </el-row>
      </el-col>
    </template>
    <template v-else>
      <el-col :xs="24" :sm="24" :md="7" :lg="7" :xl="7" class="mt-1">
        <span class="font-bold wrap-break-word">{{ startCase(name) }}</span>
        <FieldHelperCard :meta="meta" />
      </el-col>
      <el-col :xs="24" :sm="24" :md="17" :lg="17" :xl="17">
        <template v-if="Array.isArray(sortedData)">
          <ElasticField :field="d" :title="name" :key="d as string" v-for="d of pageItems" />
          <el-pagination v-if="(sortedData as unknown[]).length > pageSize" class="mt-4"
            layout="sizes, prev, pager, next" :total="(sortedData as unknown[]).length"
            :page-sizes="ui.pagination.pageSizes" v-model:page-size="pageSize" :current-page="currentPage"
            @current-change="currentPage = $event" @size-change="currentPage = 1" />
        </template>
        <template v-else>
          <ElasticField :field="data" :title="name" />
        </template>
      </el-col>
    </template>
  </el-row>
</template>
