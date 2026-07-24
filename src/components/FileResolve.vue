<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import AccessHelper from '@/components/AccessHelper.vue';
import CSVWidget from '@/components/widgets/CSVWidget.vue';
import EafTranscriptionWidget from '@/components/widgets/EafTranscriptionWidget.vue';
import PDFWidget from '@/components/widgets/PDFWidget.vue';
import PlainTextWidget from '@/components/widgets/PlainTextWidget.vue';
import { isFileVisibleByMetadata, resolveFileVisibilityConfig } from '@/composables/fileVisibility';
import { ui } from '@/configuration';
import type { AnnotationRef, ApiService, EntityType, RoCrate } from '@/services/api';
import { first } from '@/tools';

const api = inject<ApiService>('api');
if (!api) {
  throw new Error('API instance not provided');
}

const {
  entity,
  metadata,
  annotations = [],
} = defineProps<{
  entity: EntityType;
  metadata: RoCrate['hasPart'][number] & { license?: RoCrate['license'] };
  annotations?: AnnotationRef[];
}>();

const data = ref();
const downloadUrl = ref('');
const streamUrl = ref('');
const annotationUrls = ref<string[]>([]);
const currentTime = ref<number>(0);
const mediaDuration = ref<number>(0);
const mediaRef = ref<HTMLAudioElement | HTMLVideoElement | null>(null);
const fileVisibility = resolveFileVisibilityConfig(ui.presentation?.fileVisibilityField);
const shouldDisplayFile = isFileVisibleByMetadata(metadata as unknown as Record<string, unknown>, fileVisibility);

const resolveFile = async () => {
  if (!shouldDisplayFile) {
    return;
  }

  if (entity.entityType !== 'http://schema.org/MediaObject') {
    return;
  }
  const filename = metadata.filename || entity.id.split('/').pop();
  streamUrl.value = (await api.getFileUrl(entity.id, first(filename), false)) || '';
  downloadUrl.value = (await api.getFileUrl(entity.id, first(filename), true)) || '';
};

const resolveAnnotations = async () => {
  if (annotations.length === 0) {
    return;
  }

  const results = await Promise.all(
    annotations.map(async (ann) => {
      const result = await api.getEntity(ann['@id']);
      if ('error' in result) {
        return null;
      }

      const annEntity = result.entity;
      if (annEntity.entityType !== 'http://schema.org/MediaObject') {
        return null;
      }

      const filename = first(ann.filename) || annEntity.name;
      return api.getFileUrl(annEntity.id, filename, false);
    }),
  );
  annotationUrls.value = results.filter((url): url is string => !!url);
};

const handleDownload = async () => {
  if (!shouldDisplayFile) {
    return;
  }

  if (entity.entityType !== 'http://schema.org/MediaObject') {
    return;
  }

  const url = await api.getFileUrl(entity.id, first(metadata.filename), true);
  if (url) {
    window.location.href = url;
  }
};

const handleTimeUpdate = (event: Event) => {
  const el = event.target as HTMLMediaElement;
  currentTime.value = el.currentTime;
};

const handleLoadedMetadata = (event: Event) => {
  const el = event.target as HTMLMediaElement;
  mediaDuration.value = el.duration;
};

const handleSeek = (seconds: number) => {
  if (mediaRef.value) {
    mediaRef.value.currentTime = seconds;
  }
};

const extension = (first(metadata.filename) || '').split('.').pop() || '';

enum PreviewerType {
  pdf,
  csv,
  eaf,
  text,
  audio,
  video,
  image,
  other,
}

// detect type from encoding format first
let [previewerType, encodingFormat] = (() => {
  const rawEncodingFormat = metadata?.encodingFormat;
  const encodingFormats = Array.isArray(rawEncodingFormat)
    ? rawEncodingFormat
    : typeof rawEncodingFormat === 'string'
      ? [rawEncodingFormat]
      : [];

  for (const raw of encodingFormats) {
    if (typeof raw !== 'string') {
      continue;
    }
    const format = raw.toLowerCase();

    for (const suffix of ['pdf', 'csv']) {
      if (format.endsWith(suffix)) {
        return [PreviewerType[suffix as keyof typeof PreviewerType], raw];
      }
    }
    for (const prefix of ['text', 'image', 'audio', 'video']) {
      if (format.startsWith(prefix)) {
        return [PreviewerType[prefix as keyof typeof PreviewerType], raw];
      }
    }
  }
  return [PreviewerType.other, ''];
})();
// detect type from file extension as fallback
if (previewerType === PreviewerType.other || previewerType === PreviewerType.text) {
  if (extension === 'csv') {
    previewerType = PreviewerType.csv;
  } else if (extension === 'eaf') {
    previewerType = PreviewerType.eaf;
  } else if (previewerType === PreviewerType.other && ['txt', 'html', 'xml', 'flab'].includes(extension)) {
    previewerType = PreviewerType.text;
  } else if (previewerType === PreviewerType.other && extension === 'pdf') {
    previewerType = PreviewerType.pdf;
  }
}
const mediaTag = PreviewerType[previewerType as number] as 'audio' | 'video';
const mediaType = encodingFormat;

onMounted(async () => {
  resolveFile();
  if (
    shouldDisplayFile &&
    (previewerType === PreviewerType.audio || previewerType === PreviewerType.video) &&
    annotations.length > 0
  ) {
    resolveAnnotations();
  }
});
</script>

<template>
  <el-col class="w-full min-w-0">
    <el-row justify="center">
      <el-col class="w-full min-w-0">
        <div class="container max-screen-lg mx-auto">
          <div v-if="shouldDisplayFile && entity.access.content">
            <div v-if="previewerType === PreviewerType.pdf" class="w-full min-w-0">
              <PDFWidget :src="streamUrl" />
            </div>

            <div v-else-if="previewerType === PreviewerType.csv" class="p-4 wrap-break-word">
              <CSVWidget :src="streamUrl" />
            </div>

            <div v-else-if="previewerType === PreviewerType.eaf" class="p-4">
              <EafTranscriptionWidget :src="streamUrl" v-if="streamUrl" show-header />
            </div>

            <div v-else-if="previewerType === PreviewerType.text" class="p-4 wrap-break-word">
              <PlainTextWidget :src="streamUrl" v-if="streamUrl" />
            </div>

            <div v-else-if="previewerType === PreviewerType.audio || previewerType === PreviewerType.video" class="flex flex-col items-center">
              <component :is="mediaTag" ref="mediaRef" controls v-if="streamUrl" @timeupdate="handleTimeUpdate"
                @loadedmetadata="handleLoadedMetadata">
                <source :src="streamUrl" :type="mediaType">
                Your browser does not support the {{ mediaTag }} element.
              </component>
              <div v-for="(url, index) in annotationUrls" :key="index" class="w-full mt-4">
                <EafTranscriptionWidget :src="url" :current-time="currentTime" :duration="mediaDuration"
                  @seek="handleSeek" />
              </div>
            </div>

            <div v-else-if="previewerType === PreviewerType.image" class="flex justify-center">
              <img v-if="streamUrl" :src="streamUrl" />
            </div>

            <div class="p-4" v-else>
              <img height="500px" :src="data" />
            </div>
          </div>

          <div>
            <div class="flex justify-center" v-if="entity.access">
              <AccessHelper :access="entity.access" :license="metadata.license" />
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row class="flex justify-center" v-if="shouldDisplayFile && entity.access.content && entity.entityType === 'http://schema.org/MediaObject'">
      <el-button-group class="m-2">
        <el-button type="default" tag="a" :href="downloadUrl" >Download File&nbsp;<font-awesome-icon icon="fa fa-download" /></el-button>
      </el-button-group>
    </el-row>
  </el-col>
</template>
