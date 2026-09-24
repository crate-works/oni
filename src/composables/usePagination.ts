import { computed, type MaybeRefOrGetter, ref, toValue } from 'vue';
import { defaultPageSize } from '@/configuration';

export const usePagination = <T>(items: MaybeRefOrGetter<T[]>) => {
  const currentPage = ref(1);
  const pageSize = ref(defaultPageSize);

  const pageItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;

    return toValue(items).slice(start, start + pageSize.value);
  });

  return { currentPage, pageSize, pageItems };
};
