<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import MemberTable from '@/components/MemberTable.vue';
import { defaultPageSize, ui } from '@/configuration';
import type { ApiService, EntityType, GetEntitiesParams } from '@/services/api';

const api = inject<ApiService>('api');
if (!api) {
  throw new Error('API instance not provided');
}

const { title, id, entityType, sort } = defineProps<{
  title: string;
  id: string;
  entityType: string;
  sort: string;
}>();

const items = ref<EntityType[]>([]);
const total = ref(0);
const currentPage = ref(1);
const isLoading = ref(false);
const pageSize = ref(defaultPageSize);

const setMembers = async () => {
  const params: GetEntitiesParams = {
    memberOf: id,
    entityType,
    limit: pageSize.value,
    sort,
    order: 'asc',
  };

  if (currentPage.value !== 1) {
    params.offset = (currentPage.value - 1) * pageSize.value;
  }

  isLoading.value = true;

  const response = await api.getEntities(params);
  if ('error' in response) {
    // TODO: We should have an error dialog
    console.error('Error fetching entities:', response.error);
    isLoading.value = false;

    return;
  }

  items.value = response.entities;
  total.value = response.total;

  isLoading.value = false;
};

const updatePages = (page: number) => {
  currentPage.value = page;
  setMembers();
};

const handlePageSizeChange = () => {
  currentPage.value = 1;
  setMembers();
};

onMounted(setMembers);
</script>

<template>
  <template v-if="total">
    <div class="mt-4 pt-3 border-0 border-t-2 border-solid border-red-700">
      <h5 class="text-2xl tracking-tight">
        {{ title }}: {{ total }}
      </h5>
    </div>
    <el-row class="px-10 pb-10 pt-3">
      <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="24">
        <div class="py-2 w-full">
          <el-pagination class="items-center w-full" background layout="sizes, prev, pager, next" :total="total"
            :page-sizes="ui.pagination.pageSizes" v-model:page-size="pageSize" v-model:currentPage="currentPage"
            @current-change="updatePages($event)" @size-change="handlePageSizeChange" />
        </div>
        <div v-loading="isLoading">
          <MemberTable :items="items" />
        </div>
        <div class="py-2 w-full">
          <el-pagination class="items-center w-full" background layout="sizes, prev, pager, next" :total="total"
            :page-sizes="ui.pagination.pageSizes" v-model:page-size="pageSize" v-model:currentPage="currentPage"
            @current-change="updatePages($event)" @size-change="handlePageSizeChange" />
        </div>
      </el-col>
    </el-row>
  </template>
</template>
