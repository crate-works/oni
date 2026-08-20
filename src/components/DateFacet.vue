<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Bucket, FacetType, HierarchicalBucket } from '@/composables/search';

const { t } = useI18n();

const props = defineProps<{
  facetName: string;
  buckets: FacetType['buckets'];
  initialSelectedFacetValues: string[] | undefined;
}>();

const emit = defineEmits<{
  updated: [facetName: string, values: string[]];
  isActive: [];
}>();

const expandedDecades = ref<Set<string>>(new Set());
const selectedYears = ref<Set<string>>(new Set(props.initialSelectedFacetValues));

watch(
  () => props.initialSelectedFacetValues,
  (newValues) => {
    selectedYears.value = new Set(newValues);
  },
);

const isDecadeFullySelected = (decade: HierarchicalBucket) =>
  decade.children.every((year) => selectedYears.value.has(year.name));

const isDecadePartiallySelected = (decade: HierarchicalBucket) => {
  const selectedCount = decade.children.filter((year) => selectedYears.value.has(year.name)).length;

  return selectedCount > 0 && selectedCount < decade.children.length;
};

const toggleDecadeExpansion = (decadeName: string) => {
  if (expandedDecades.value.has(decadeName)) {
    expandedDecades.value.delete(decadeName);
  } else {
    expandedDecades.value.add(decadeName);
  }
};

const toggleDecade = (decade: HierarchicalBucket) => {
  const isFullySelected = isDecadeFullySelected(decade);

  if (isFullySelected) {
    decade.children.forEach((year) => {
      selectedYears.value.delete(year.name);
    });
  } else {
    decade.children.forEach((year) => {
      selectedYears.value.add(year.name);
    });

    expandedDecades.value.add(decade.name);
  }

  updateFacet();
};

const toggleYear = (year: Bucket) => {
  if (selectedYears.value.has(year.name)) {
    selectedYears.value.delete(year.name);
  } else {
    selectedYears.value.add(year.name);
  }

  updateFacet();
};

const updateFacet = () => {
  const years = Array.from(selectedYears.value);
  emit('updated', props.facetName, years);

  if (years.length > 0) {
    emit('isActive');
  }
};

// Sort decades in descending order (most recent first)
const sortedBuckets = computed(() => {
  return [...props.buckets].sort((a, b) => b.name.localeCompare(a.name)).filter((decade) => 'children' in decade);
});
</script>

<template>
  <div class="max-h-[400px] overflow-y-auto">
    <div v-for="decade in sortedBuckets" :key="decade.name" class="mb-3">
      <div class="flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded">
        <div class="flex items-center flex-1">
          <el-checkbox :model-value="isDecadeFullySelected(decade)" :indeterminate="isDecadePartiallySelected(decade)"
            @change="toggleDecade(decade)" class="mr-2" />
          <button @click="toggleDecadeExpansion(decade.name)" class="flex items-center flex-1 text-left">
            <font-awesome-icon :icon="expandedDecades.has(decade.name) ? 'fa fa-chevron-down' : 'fa fa-chevron-right'"
              class="text-xs mr-2 text-gray-500" />
            <span class="text-gray-700 font-medium">{{ decade.name }}</span>
          </button>
        </div>
        <span class="text-sm text-gray-500 ml-2">{{ decade.count }}</span>
      </div>

      <div v-if="expandedDecades.has(decade.name)" class="ml-6 mt-1">
        <div v-for="year in decade.children" :key="year.name"
          class="flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded">
          <div class="flex items-center flex-1">
            <el-checkbox :model-value="selectedYears.has(year.name)" @change="toggleYear(year)" :label="year.name" />
          </div>
          <span class="text-sm text-gray-500 ml-2">{{ year.count }}</span>
        </div>
      </div>
    </div>

    <div v-if="sortedBuckets.length === 0" class="text-gray-500 text-sm px-2 py-2">
      {{ t('search.noFacetsAvailable') }}
    </div>
  </div>
</template>
