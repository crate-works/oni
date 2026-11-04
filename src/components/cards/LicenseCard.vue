<script setup lang="ts">
import { licenseLabel } from '@researchdatabox/oni-client';

import TruncateText from '@/components/TruncateText.vue';
import { joinAll } from '@/lib/tools';
import type { RoCrate } from '@/services/api';

const { license } = defineProps<{
  license: NonNullable<RoCrate['license']>;
}>();

const localLicense = license[0];

if (!localLicense) {
  console.warn('🪚 WHY: No license');
  throw new Error('No License');
}

const label = licenseLabel(license);
</script>

<template>
  <div class="flex flex-col gap-8 p-4 items-center">
    <a v-if="label.url" class="underline" :href="label.url" target="_blank" rel="noopener noreferrer">
      {{ label.full }}
    </a>
    <span v-else>{{ label.full }}</span>

    <TruncateText v-if="localLicense.description" :text="joinAll(localLicense.description, '\n\n')" :lines="2" />
  </div>
</template>
