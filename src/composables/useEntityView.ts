import { metadataName, selectMetadata } from '@researchdatabox/oni-client';
import type { VueHeadClient } from '@unhead/vue';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead, useRecordHead } from '@/composables/head';
import type { CollectionConfig, FileConfig, ObjectConfig } from '@/configuration';
import type { EntityType, RoCrate } from '@/services/api';

export function useEntityView(config: CollectionConfig | ObjectConfig | FileConfig, head?: VueHeadClient) {
  const router = useRouter();
  const route = useRoute();

  const name = ref<string>('');
  const meta = ref<{ name: string; data: RoCrate[keyof RoCrate] }[]>([]);

  let headEntry: { dispose: () => void } | undefined;

  const populate = (entity: EntityType, md?: RoCrate, nameFallback?: string) => {
    if (md) {
      name.value = metadataName(md, nameFallback);
      const options =
        config.meta.mode === 'explicit'
          ? { mode: 'explicit' as const, show: config.meta.show }
          : { top: config.meta.top.map(({ name }) => ({ name })), hide: config.meta.hide };
      meta.value = selectMetadata(md, options);
    } else {
      name.value = entity.name;
      meta.value = [];
    }

    if (head) {
      headEntry?.dispose();
      headEntry = md ? useHead(head, md) : useRecordHead(head, entity);
    }
  };

  const handleMissingEntity = () => {
    router.replace({
      name: 'NotFound',
      params: { pathMatch: route.path.substring(1).split('/') },
      query: route.query,
      hash: route.hash,
    });
  };

  return {
    name,
    meta,
    populate,
    handleMissingEntity,
  };
}
