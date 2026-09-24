<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PaginatedList from '@/components/PaginatedList.vue';
import type { EntityType } from '@/services/api';

const { t } = useI18n();
const { entity } = defineProps<{
  entity: EntityType | undefined;
}>();

const getSearchUrl = (filterName: string, filterValue: string) => {
  const f = {
    rootCollection: [entity?.rootCollection?.name],

    [filterName]: [filterValue],
  };
  const stringify = JSON.stringify(f);

  return `/search?f=${encodeURIComponent(encodeURIComponent(stringify))}`;
};
</script>

<template>
  <ul v-if="entity">
    <template v-if="entity.language">
      <li><span class="font-semibold">{{ t('metadata.language') }}</span></li>
      <PaginatedList :items="entity.language" v-slot="{ item }">{{ item }}</PaginatedList>
    </template>

    <template v-if="entity.communicationMode && entity.communicationMode.length">
      <li><span class="font-semibold">{{ t('summaries.communicationMode') }}</span></li>
      <li v-for="communicationMode in entity.communicationMode" class="ml-4 pl-2">
        <el-link underline="always" type="primary">
          <router-link :to="getSearchUrl('communicationMode', communicationMode)">
            {{ communicationMode }}
          </router-link>
        </el-link>
      </li>
    </template>

    <template v-if="entity.mediaType">
      <li><span class="font-semibold">{{ t('summaries.fileFormats') }}</span></li>
      <PaginatedList :items="entity.mediaType" v-slot="{ item }">
        <el-link underline="always" type="primary">
          <router-link :to="getSearchUrl('encodingFormat', item)">
            {{ item }}
          </router-link>
        </el-link>
      </PaginatedList>
    </template>
  </ul>
</template>
