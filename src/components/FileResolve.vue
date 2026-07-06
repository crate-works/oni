<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AccessHelper from '@/components/AccessHelper.vue';
import CSVWidget from '@/components/widgets/CSVWidget.vue';
import EafTranscriptionWidget from '@/components/widgets/EafTranscriptionWidget.vue';
import PDFWidget from '@/components/widgets/PDFWidget.vue';
import PlainTextWidget from '@/components/widgets/PlainTextWidget.vue';
import { isFileVisibleByMetadata, resolveFileVisibilityConfig } from '@/composables/fileVisibility';
import { ui } from '@/configuration';
import { first } from '@/lib/tools';
import {
  fileDeepLink,
  formatTimecode,
  parsePageParam,
  parseStartParam,
  parseTierParam,
  startParamToMs,
} from '@/segments';
import type { AnnotationRef, ApiService, EntityType, RoCrate } from '@/services/api';

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
const streamUrl = ref('');
const annotationUrls = ref<string[]>([]);
const linkedMedia = ref<{ id: string; name: string }[]>([]);
const currentTime = ref<number>(0);
const mediaDuration = ref<number>(0);
const mediaRef = ref<HTMLAudioElement | HTMLVideoElement | null>(null);

const { t } = useI18n();

// Deep-link arrival parameters (stale or malformed values are simply dropped)
const route = useRoute();
const pageParam = parsePageParam(route.query.page) ?? undefined;
const startParam = parseStartParam(route.query.start);
const tierParam = parseTierParam(route.query.tier) ?? undefined;
const matchStartMs = startParam !== null ? startParamToMs(startParam) : undefined;
const fileVisibility = resolveFileVisibilityConfig(ui.presentation?.fileVisibilityField);
const shouldDisplayFile = isFileVisibleByMetadata(metadata as unknown as Record<string, unknown>, fileVisibility);
const filename = computed(() => first(metadata.filename) || entity.id.split('/').pop() || 'file');
const resolveFile = async () => {
  if (!shouldDisplayFile) {
    return;
  }

  if (entity.entityType !== 'http://schema.org/MediaObject') {
    return;
  }
  streamUrl.value = (await api.getFileUrl(entity.id, filename.value, false)) || '';
};

// Resolve hasAnnotation/annotationOf references to the media files they point at
const resolveMediaRefs = async (refs: AnnotationRef[]) => {
  const results = await Promise.all(
    refs.map(async (ref) => {
      const result = await api.getEntity(ref['@id']);
      if ('error' in result || result.entity.entityType !== 'http://schema.org/MediaObject') {
        return null;
      }

      return { id: result.entity.id, name: first(ref.filename) || result.entity.name };
    }),
  );

  return results.filter((media): media is { id: string; name: string } => !!media);
};

const resolveAnnotations = async () => {
  const media = await resolveMediaRefs(annotations);
  const urls = await Promise.all(media.map(({ id, name }) => api.getFileUrl(id, name, false)));
  annotationUrls.value = urls.filter((url): url is string => !!url);
};

// A transcription's annotationOf references point at the media file(s) it
// annotates; resolve them so the banner can link into the recording.
const resolveLinkedMedia = async () => {
  linkedMedia.value = await resolveMediaRefs(metadata.annotationOf ?? []);
};

const handleDownload = async () => {
  if (!shouldDisplayFile) {
    return;
  }

  if (entity.entityType !== 'http://schema.org/MediaObject') {
    return;
  }

  const url = await api.getFileUrl(entity.id, filename.value, true);
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

  // Deep-link arrival: seek to ?start= but stay paused. The media element
  // itself clamps seeks past the duration, so stale times can't break anything.
  if (startParam !== null) {
    el.currentTime = startParam;
  }
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

  if (shouldDisplayFile && previewerType === PreviewerType.eaf) {
    resolveLinkedMedia();
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
              <PDFWidget :src="streamUrl" :initial-page="pageParam" />
            </div>

            <div v-else-if="previewerType === PreviewerType.csv" class="p-4 wrap-break-word">
              <CSVWidget :src="streamUrl" />
            </div>

            <div v-else-if="previewerType === PreviewerType.eaf" class="p-4">
              <div v-if="linkedMedia.length" class="mb-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <div v-for="media of linkedMedia" :key="media.id" class="flex items-center gap-2 py-0.5">
                  <font-awesome-icon icon="fa fa-play" class="text-gray-500" />
                  <router-link :to="fileDeepLink(media.id, startParam, tierParam)"
                    class="text-blue-600 hover:text-blue-800 underline">
                    {{ matchStartMs !== undefined
                      ? t('file.playFrom', { name: media.name, time: formatTimecode(matchStartMs) })
                      : t('file.play', { name: media.name }) }}
                  </router-link>
                </div>
              </div>
              <EafTranscriptionWidget :src="streamUrl" v-if="streamUrl" show-header :initial-tier="tierParam"
                :match-start-ms="matchStartMs" />
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
                  :initial-tier="tierParam" :match-start-ms="matchStartMs" @seek="handleSeek" />
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
        <el-button type="default" @click="handleDownload">Download File&nbsp;<font-awesome-icon icon="fa fa-download" /></el-button>
      </el-button-group>
    </el-row>
  </el-col>
</template>
