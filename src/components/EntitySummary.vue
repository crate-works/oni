<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import MediaTypeIcon from '@/components//widgets/MediaTypeIcon.vue';
import AccessControlIcon from '@/components/widgets/AccessControlIcon.vue';
import CommunicationModeIcon from '@/components/widgets/CommunicationModeIcon.vue';
import { ui } from '@/configuration';
import { getEntityUrl } from '@/lib/tools';
import { segmentRows } from '@/segments';
import type { EntityType } from '@/services/api';

const { t } = useI18n();
const { entity } = defineProps<{ entity: EntityType }>();

// TODO: Rename this
const { searchDetails = [] } = ui.search || {};

const VISIBLE_SEGMENTS = 2;

const segments = computed(() => segmentRows(entity.id, entity.searchExtra?.segments ?? []));
const segmentsExpanded = ref(false);
const visibleSegments = computed(() =>
  segmentsExpanded.value ? segments.value : segments.value.slice(0, VISIBLE_SEGMENTS),
);
const hiddenSegmentCount = computed(() => segments.value.length - VISIBLE_SEGMENTS);
</script>

<template>
  <div><!-- Wrapping an empty div because of multiple roots with v-for-->
    <el-row>
      <el-col :xs="24" :sm="15" :md="15" :lg="17" :xl="19" :span="20">
        <el-row :align="'middle'">
          <h5 class="text-2xl font-medium">
            <router-link :to="getEntityUrl(entity)"
              class="text-blue-600 hover:text-blue-800 visited:text-purple-600 wrap-break-word">
              {{ entity.identifiers?.shortIdentifier ? `${entity.identifiers.shortIdentifier} - ${entity.name || entity.id}` : entity.name || entity.id }}
            </router-link>
          </h5>
        </el-row>

        <el-row :align="'middle'">
          <p class="font-normal text-gray-700">
            {{ t('entity.type') }}
            <span class="m-2">{{ entity.entityType }}</span>
          </p>
        </el-row>

        <template v-for="special of searchDetails">
          <el-row v-if="entity[special.field as keyof EntityType]">
            <p class="font-normal text-gray-700">
              {{ special.label }}:&nbsp;
            </p>
            <p>{{ (entity[special.field as keyof EntityType] as
              string[]).join(', ') }}</p>
          </el-row>
        </template>

        <el-row align="middle" v-if="entity.memberOf">
          <p class="font-normal text-gray-700">
            {{ t('entity.memberOf') }}&nbsp;
          </p>
          <router-link class="text-sm m-2 text-gray-700 underline"
            :to="'/collection?id=' + encodeURIComponent(entity.memberOf.id)">
            {{ entity.memberOf.name || entity.memberOf.id }}
          </router-link>
        </el-row>

        <el-row align="middle"
          v-if="entity.rootCollection && entity.rootCollection?.id !== entity.memberOf?.id && entity.rootCollection?.id !== entity.id"
          class="pt-2">
          <p class="font-normal text-gray-700">
            {{ t('entity.in') }}&nbsp;
          </p>
          <router-link :to="'/collection?id=' + encodeURIComponent(entity.rootCollection.id)">
            <el-button>{{ entity.rootCollection.name || entity.rootCollection.id }}</el-button>
          </router-link>
        </el-row>

        <el-row align="middle">
          <p class="font-normal text-gray-700">
            ID: &nbsp;
          </p>
          <p class="font-normal text-gray-700">
            {{ entity.id }}
          </p>
        </el-row>

        <el-row class="py-4 pr-4" v-if="entity.description">
          <p className="line-clamp-3">{{ entity.description }}</p>
        </el-row>

        <el-row class="gap-2 flex">
          <span class="after:content-[','] last:after:content-none" v-if="entity.counts.collections">
            {{ t('entity.collections') }} {{ entity.counts.collections }}
          </span>
          <span class="after:content-[','] last:after:content-none" v-if="entity.counts.objects">
            {{ t('entity.objects') }} {{ entity.counts.objects }}
          </span>
          <span class="after:content-[','] last:after:content-none" v-if="entity.counts.files">
            {{ t('entity.files') }} {{ entity.counts.files }}
          </span>
        </el-row>

        <el-row align="middle" v-if="segments.length">
          <ul class="w-full min-w-0">
            <li v-for="(segment, index) of visibleSegments" :key="index" class="p-1">
              <component :is="segment.url ? RouterLink : 'div'" v-bind="segment.url ? { to: segment.url } : {}"
                class="flex items-center gap-2 min-w-0" :class="segment.url ? 'group' : ''">
                <span v-if="segment.label"
                  class="inline-flex items-center gap-1 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  :class="segment.url ? 'group-hover:bg-gray-200' : ''">
                  {{ segment.label }}
                  <template v-if="segment.tier">
                    <span>·</span>
                    <span class="max-w-[20ch] truncate" :title="segment.tier">{{ segment.tier }}</span>
                  </template>
                </span>
                <span v-if="segment.highlight" class="line-clamp-1 min-w-0"
                  :class="segment.url ? 'group-hover:underline' : ''" v-html="'...' + segment.highlight + '...'" />
              </component>
            </li>
            <li v-if="!segmentsExpanded && hiddenSegmentCount > 0" class="p-1">
              <el-button link type="primary" size="small" @click="segmentsExpanded = true">
                {{ t('entity.moreMatches', { n: hiddenSegmentCount }) }}
              </el-button>
            </li>
          </ul>
        </el-row>

        <el-row align="middle" v-else-if="entity.searchExtra?.highlight">
          <ul>
            <li v-for="hl of Object.values(entity.searchExtra.highlight || {}).flat()" v-html="'...' + hl + '...'" class="p-2">
            </li>
          </ul>
        </el-row>

        <el-row v-if="entity.searchExtra?.score" class="pt-2">
          <div>
            <font-awesome-icon icon="fa-solid fa-5x fa-award" />
            {{ t('entity.relevanceScore') }} {{ entity.searchExtra.score }}
          </div>
        </el-row>

      </el-col>

      <el-col :xs="24" :sm="9" :md="9" :lg="7" :xl="5" :span="4" :offset="0">
        <AccessControlIcon :accessControl="entity.accessControl" />
        <el-row :span="24" class="flex justify-center">
          <template v-for="communicationMode of entity.communicationMode">
            <CommunicationModeIcon :communication-mode="communicationMode" />
          </template>
        </el-row>
        <el-row :span="24" class="flex justify-center">
          <template v-for="mediaType of entity.mediaType">
            <MediaTypeIcon :mediaType="mediaType" />
          </template>
        </el-row>
      </el-col>
    </el-row>
    <hr class="divide-y divide-gray-500" />
  </div>
</template>
