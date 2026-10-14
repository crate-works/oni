<script setup lang="ts">
import { useGtm } from '@gtm-support/vue-gtm';
import { injectHead } from '@unhead/vue';
import { computed, inject, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AccessHelper from '@/components/AccessHelper.vue';
import FileResolve from '@/components/FileResolve.vue';
import MetaField from '@/components/MetaField.vue';
import { resolveFileVisibilityConfig, resolvePreferredPhotoField } from '@/composables/fileVisibility';
import { useEntityView } from '@/composables/useEntityView';
import { ui } from '@/configuration';
import type { ApiService, EntityType, FileType, GetFilesParams, RoCrate } from '@/services/api';
import { resolvePersonFilePresentationData } from '@/services/personFiles';

const FETCH_LIMIT = 1000;

const api = inject<ApiService>('api');
if (!api) {
  throw new Error('API instance not provided');
}

const route = useRoute();
const head = injectHead();
const gtm = useGtm();
const { object: config } = ui;
const fileVisibility = resolveFileVisibilityConfig(ui.presentation?.fileVisibilityField);
const preferredPhotoField = resolvePreferredPhotoField(ui.presentation?.preferredPhotoField);

const { name, meta, populate, handleMissingEntity } = useEntityView(config, head);

const isLoading = ref(false);
const entity = ref<EntityType | undefined>();
const metadata = ref<RoCrate | undefined>();
const files = ref<FileType[]>([]);
const photoUrls = ref<Record<string, string>>({});
const browserImageById = ref<Record<string, boolean>>({});
const fileVisibilityById = ref<Record<string, boolean>>({});
const isPhotoVisibilityReady = ref(false);
const selectedPhotoId = ref<string>();

const normalizePath = (value: string) => value.replace(/^\.\//, '').split(/[?#]/)[0] || value;

const basename = (value: string) => {
  const normalized = normalizePath(value);
  const lastSlashIndex = normalized.lastIndexOf('/');

  return lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized;
};

const extractStringPaths = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStringPaths(item));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    if (typeof obj['@id'] === 'string') {
      return [obj['@id']];
    }

    return [];
  }

  return [];
};

const photoFiles = computed(() => {
  return files.value.filter((file) => {
    if (!file.access.content) {
      return false;
    }

    if (fileVisibilityById.value[file.id] === false) {
      return false;
    }

    if (file.mediaType.startsWith('image/')) {
      return true;
    }

    return browserImageById.value[file.id] === true;
  });
});

const preferredPhotoPaths = computed(() => {
  const metadataRecord = metadata.value as Record<string, unknown> | undefined;
  const preferredPhotoValue = metadataRecord?.[preferredPhotoField];
  if (!preferredPhotoValue) {
    return [];
  }

  return extractStringPaths(preferredPhotoValue);
});

const preferredPhotoId = computed(() => {
  if (!photoFiles.value.length || !preferredPhotoPaths.value.length) {
    return undefined;
  }

  const imageCandidates = preferredPhotoPaths.value.map((path) => normalizePath(path));

  const preferred = photoFiles.value.find((file) => {
    const filePath = normalizePath(file.filename);
    const fileBase = basename(file.filename);

    return imageCandidates.some((candidate) => candidate === filePath || basename(candidate) === fileBase);
  });

  return preferred?.id;
});

const photoFile = computed(() => {
  if (!photoFiles.value.length) {
    return undefined;
  }

  return (
    photoFiles.value.find((file) => file.id === selectedPhotoId.value) ||
    photoFiles.value.find((file) => file.id === preferredPhotoId.value) ||
    photoFiles.value[0]
  );
});

const photoMetadata = computed(() => {
  if (!photoFile.value) {
    return undefined;
  }

  return {
    '@id': photoFile.value.filename,
    filename: [photoFile.value.filename],
    encodingFormat: [photoFile.value.mediaType],
    contentSize: [photoFile.value.size],
    license: metadata.value?.license,
  };
});

const photoEntity = computed(() => {
  if (!entity.value || !photoFile.value) {
    return undefined;
  }

  return {
    ...entity.value,
    id: photoFile.value.id,
    entityType: 'http://schema.org/MediaObject',
    access: {
      ...entity.value.access,
      content: photoFile.value.access.content,
      contentAuthorizationUrl: photoFile.value.access.contentAuthorizationUrl,
    },
  };
});

const thumbnailPhotos = computed(() => photoFiles.value.filter((file) => file.id !== photoFile.value?.id));

const fetchAllPages = async <T>(
  fetcher: (params: Record<string, string>) => Promise<Record<string, unknown>>,
  baseParams: Record<string, string>,
  itemsKey: string,
): Promise<T[]> => {
  let collected: T[] = [];
  let offset = 0;
  let total = 0;

  do {
    const params = { ...baseParams, offset: String(offset), limit: String(FETCH_LIMIT) };
    const result = await fetcher(params);

    if (!(itemsKey in result)) {
      break;
    }

    collected = collected.concat(result[itemsKey] as T[]);
    total = result.total as number;
    offset += FETCH_LIMIT;
  } while (offset < total);

  return collected;
};

const fetchFiles = async (id: string) => {
  isPhotoVisibilityReady.value = false;
  files.value = [];
  photoUrls.value = {};
  browserImageById.value = {};
  fileVisibilityById.value = {};

  const fetchedFiles = await fetchAllPages<FileType>(
    (params) => api.getFiles(params as GetFilesParams),
    { memberOf: id },
    'files',
  );

  const presentationData = await resolvePersonFilePresentationData({
    api,
    files: fetchedFiles,
    fileVisibility,
  });

  files.value = fetchedFiles;
  fileVisibilityById.value = presentationData.fileVisibilityById;
  photoUrls.value = presentationData.photoUrls;
  browserImageById.value = presentationData.browserImageById;
  isPhotoVisibilityReady.value = true;
};

const fetchData = async () => {
  const id = route.query.id?.toString();
  if (!id) {
    handleMissingEntity();

    return;
  }

  isLoading.value = true;

  try {
    const result = await api.getEntityWithMetadata(id);
    if ('error' in result) {
      handleMissingEntity();

      return;
    }

    entity.value = result.entity;
    metadata.value = result.metadata;
    selectedPhotoId.value = undefined;
    populate(result.entity, result.metadata);

    await fetchFiles(id);

    gtm?.trackEvent({
      event: '/person',
      category: 'person',
      label: 'loaded-person',
      value: id,
    });
  } catch (error) {
    if (!(error instanceof Error && error.message === 'Not authorised')) {
      throw error;
    }
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => route.query.id,
  () => {
    fetchData();
  },
);

fetchData();
</script>

<template>
  <div v-if="isLoading && !entity" v-loading="true" class="min-h-[400px] w-full" />
  <div v-if="entity" class="px-10 pt-10 pb-7 bg-white">
    <el-row :align="'middle'" class="mb-2 text-3xl font-medium">
      <h5>{{ name }}</h5>
    </el-row>
    <hr class="divider divider-gray pt-2" />
  </div>

  <el-row :justify="'center'" v-if="entity" class="m-5 px-10" v-loading="isLoading">
    <el-col :xs="24" :sm="24" :md="24" :lg="16" :xl="16">
      <el-row :gutter="24">
        <el-col :xs="24" :sm="24" :md="24" :lg="8" :xl="8" class="pb-6 flex flex-col items-center lg:items-stretch">
          <template v-if="!isPhotoVisibilityReady">
            <el-row>
              <el-col :span="24" class="flex justify-center">
                <div
                  class="w-full max-w-md h-64 rounded-lg border border-gray-300 bg-gray-100 text-gray-600 flex flex-col items-center justify-center"
                >
                  <p class="mt-3 text-sm">Loading photos...</p>
                </div>
              </el-col>
            </el-row>
          </template>
          <template v-else-if="photoMetadata && photoEntity">
            <el-row justify="center" class="w-full">
              <el-col :span="24" class="flex justify-center">
                <div class="w-full max-w-md mx-auto">
                  <FileResolve :key="photoEntity.id" :entity="photoEntity" :metadata="photoMetadata" />
                </div>
              </el-col>
            </el-row>
            <el-row v-if="thumbnailPhotos.length" class="mt-4">
              <el-col :span="24">
                <div class="flex flex-col gap-3">
                  <button
                    v-for="photo of thumbnailPhotos"
                    :key="photo.id"
                    type="button"
                    class="w-full rounded-lg border border-gray-300 overflow-hidden cursor-pointer bg-white"
                    @click="selectedPhotoId = photo.id"
                  >
                    <div v-if="photoUrls[photo.id]" class="h-24 w-full bg-gray-50 flex items-center justify-center p-2">
                      <img
                        :src="photoUrls[photo.id]"
                        :alt="photo.filename"
                        class="max-h-full max-w-full w-auto h-auto object-contain"
                      />
                    </div>
                    <div
                      v-else
                      class="h-24 w-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs px-2"
                    >
                      {{ photo.filename }}
                    </div>
                  </button>
                </div>
              </el-col>
            </el-row>
          </template>
          <el-row v-else>
            <el-col :span="24" class="flex justify-center">
              <div
                class="w-full max-w-md h-64 rounded-lg border border-gray-300 bg-gray-100 text-gray-600 flex flex-col items-center justify-center"
              >
                <font-awesome-icon icon="fa-regular fa-user" size="3x" />
                <p class="mt-3 text-sm">No photo available</p>
              </div>
            </el-col>
          </el-row>
        </el-col>

        <el-col :xs="24" :sm="24" :md="24" :lg="16" :xl="16">
          <AccessHelper v-if="!metadata" :access="entity.access" level="metadata" />
          <AccessHelper v-else-if="metadata.license" :access="entity.access" :license="metadata.license" />

          <el-row>
            <el-col v-for="item of meta" :key="item.name">
              <MetaField :meta="item" />
            </el-col>
          </el-row>
        </el-col>
      </el-row>
    </el-col>
  </el-row>
</template>
