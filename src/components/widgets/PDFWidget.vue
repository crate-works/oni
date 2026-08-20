<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VuePdfEmbed from 'vue-pdf-embed';
import { clampPage } from '@/segments';

const { src, initialPage } = defineProps<{
  src: string;
  // Clamped into the document's page range once the page count is known
  initialPage?: number;
}>();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;
const RESIZE_DEBOUNCE_MS = 100;
// Hard ceiling on the rendered pixel width — a safety net so a layout that
// (re)introduces a shrink-to-fit ancestor can never feed the ResizeObserver
// into an unbounded zoom loop and hang the tab.
const MAX_RENDER_WIDTH = 4000;

const wrapper = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const page = ref(1);
const numPages = ref(0);
const zoom = ref(1);
const status = ref<'loading' | 'ready' | 'failed' | 'password'>('loading');

// Render at a real pixel width so every PDF lands at the same on-screen width
// (vue-pdf-embed renders the canvas bitmap at width × devicePixelRatio, so it
// stays crisp on HiDPI displays). floor() avoids a 1px overflow scrollbar at 100%.
const renderWidth = computed(() => Math.min(MAX_RENDER_WIDTH, Math.floor(containerWidth.value * zoom.value)));
const zoomPercent = computed(() => Math.round(zoom.value * 100));
const canRender = computed(
  () => Boolean(src) && containerWidth.value > 0 && status.value !== 'failed' && status.value !== 'password',
);

let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

const measure = (width: number) => {
  const next = Math.floor(width);
  if (next > 0 && next !== containerWidth.value) {
    containerWidth.value = next;
  }
};

onMounted(() => {
  if (!wrapper.value) {
    return;
  }

  measure(wrapper.value.clientWidth);
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => measure(width), RESIZE_DEBOUNCE_MS);
  });
  resizeObserver.observe(wrapper.value);
});

onBeforeUnmount(() => {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeObserver?.disconnect();
});

// Reset view state whenever a different document is loaded.
watch(
  () => src,
  () => {
    page.value = 1;
    numPages.value = 0;
    zoom.value = 1;
    status.value = 'loading';
  },
);

const onLoaded = (doc: { numPages?: number }) => {
  numPages.value = doc?.numPages ?? 0;
  status.value = 'ready';

  const startPage = initialPage !== undefined ? clampPage(initialPage, numPages.value) : null;
  if (startPage !== null) {
    page.value = startPage;
  }
};

const onFailed = () => {
  status.value = 'failed';
};

const onPasswordRequested = () => {
  status.value = 'password';
};

// Round to whole cents so repeated 0.25 steps don't accumulate float drift.
const setZoom = (value: number) => {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
};

const zoomIn = () => setZoom(zoom.value + ZOOM_STEP);
const zoomOut = () => setZoom(zoom.value - ZOOM_STEP);
const resetZoom = () => {
  zoom.value = 1;
};
</script>

<template>
  <div ref="wrapper" class="w-full min-w-0">
    <div class="flex flex-wrap items-center justify-center gap-4 py-2">
      <el-button-group>
        <el-button :disabled="zoom <= MIN_ZOOM" @click="zoomOut" aria-label="Zoom out">
          <font-awesome-icon icon="fa fa-magnifying-glass-minus" />
        </el-button>
        <el-button @click="resetZoom" aria-label="Reset zoom to fit width">{{ zoomPercent }}%</el-button>
        <el-button :disabled="zoom >= MAX_ZOOM" @click="zoomIn" aria-label="Zoom in">
          <font-awesome-icon icon="fa fa-magnifying-glass-plus" />
        </el-button>
      </el-button-group>

      <el-pagination v-if="numPages > 1" background layout="prev, pager, next, jumper" :page-size="1"
        :total="numPages" v-model:current-page="page" />
    </div>

    <div class="w-full min-w-0 overflow-x-auto" v-loading="status === 'loading'">
      <p v-if="status === 'failed' || status === 'password'" class="py-8 text-center text-gray-500">
        {{ status === 'failed'
          ? "Couldn't display this PDF. Try downloading it instead."
          : "This PDF is password protected and can't be previewed." }}
      </p>
      <vue-pdf-embed v-else-if="canRender" :source="src" :page="page" :width="renderWidth" @loaded="onLoaded"
        @loading-failed="onFailed" @rendering-failed="onFailed" @password-requested="onPasswordRequested" />
    </div>
  </div>
</template>

<style>
.vue-pdf-embed {
  margin: auto;
}
</style>
