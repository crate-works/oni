<script setup lang="ts">
import { inject, ref } from 'vue';
import { useRoute } from 'vue-router';
import FileResolve from '@/components/FileResolve.vue';
import MetaField from '@/components/MetaField.vue';
import { useEntityView } from '@/composables/useEntityView';
import { ui } from '@/configuration';
import type { AnnotationRef, ApiService, EntityType, RoCrate } from '@/services/api';
import { getEntityUrl } from '@/tools';

const api = inject<ApiService>('api');
if (!api) {
  throw new Error('API instance not provided');
}

const route = useRoute();

const { name, meta, populateName, populateMeta, handleMissingEntity } = useEntityView(ui.file);

type FileRoCrate = RoCrate['hasPart'][number];

const id = route.query.id?.toString() as string;

const parentTitle = ref<string>();
const parentUrl = ref<string>();
const metadata = ref<FileRoCrate | undefined>();
const entity = ref<EntityType | undefined>();
const annotations = ref<AnnotationRef[]>([]);
const isLoading = ref(true);

const populateData = (md: FileRoCrate, e: EntityType) => {
  populateName(md as unknown as RoCrate, md['@id']);

  parentTitle.value = e.memberOf?.name || e.memberOf?.id;

  populateMeta(md as unknown as RoCrate);

  // Extract annotation references
  if (md.hasAnnotation) {
    annotations.value = md.hasAnnotation;
  }

  metadata.value = md;
  entity.value = e;
};

const getFileMetadata = async () => {
  if (!id) {
    handleMissingEntity();

    return;
  }

  try {
    const { entity: fileEntity, metadata: md } = await api.getEntity(id);
    if (!md) {
      handleMissingEntity();

      return;
    }

    populateData(md as unknown as FileRoCrate, fileEntity);

    if (fileEntity.memberOf?.id) {
      try {
        const parentEntity = await api.getEntity(fileEntity.memberOf.id);
        if (!('error' in parentEntity)) {
          parentUrl.value = getEntityUrl(parentEntity.entity);
        }
      } catch {
        // fall back to entity default
      }
    }

    if (!parentUrl.value && fileEntity.memberOf?.id) {
      parentUrl.value = `/entity?id=${encodeURIComponent(fileEntity.memberOf.id)}`;
    }
  } catch (e) {
    // 'Not authorised' from the API's 401-retry path triggers a login redirect;
    // swallow it so the (about-to-unload) view doesn't surface an uncaught rejection.
    if (!(e instanceof Error && e.message === 'Not authorised')) {
      throw e;
    }
  } finally {
    isLoading.value = false;
  }
};

getFileMetadata();
</script>

<template>
  <div v-if="isLoading && (!entity || !metadata)" v-loading="true" class="min-h-[400px] w-full" />
  <el-row :justify="'center'" class="w-full" v-if="entity && metadata">
    <el-col :span="24">
      <div class="container mx-auto">
        <el-row>
          <el-col :xs="24" :sm="15" :md="24" :lg="24" :xl="24">
            <h3 class="relative space-x-3 font-bold p-3 text-xl select-none text-left">
              <router-link v-if="parentUrl" :to="parentUrl"
                class="wrap-break-word no-underline text-blue-600 hover:text-blue-800 visited:text-purple-600">
                <font-awesome-icon icon="fa fa-arrow-left" />
                {{ parentTitle }}
              </router-link>
              >&nbsp;<span>{{ name || id }}</span>
            </h3>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :sm="15" :md="24" :lg="24" :xl="24">
            <ul>
              <li v-for="m of meta">
                <MetaField :meta="m" />
              </li>
            </ul>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="24" class="flex justify-center h-screen overflow-auto">
            <FileResolve :entity="entity" :metadata="metadata" :annotations="annotations" />
          </el-col>
        </el-row>
      </div>
    </el-col>
  </el-row>
</template>
