<script setup lang="ts">
import Papa from 'papaparse';

import { ref, watchEffect } from 'vue';

const isLoading = ref(true);

const { src, limitRows } = defineProps<{ src: string; limitRows?: number }>();

type CsvData = {
  cols: string[];
  data: Record<string, string>[];
  error: string;
};
const csv = ref<CsvData>({ cols: [], data: [], error: '' });

watchEffect(async () => {
  if (src) {
    isLoading.value = true;
    Papa.parse<string[]>(src, {
      download: true,
      complete: (results) => {
        //Guess that the first elements are the headers. Then shift the array.
        csv.value.cols = results.data.shift() || [];

        const data = limitRows ? results.data.slice(0, limitRows) : results.data;

        csv.value.data = data.map((r) => {
          const row: Record<string, string> = {};
          for (let [index, col] of csv.value.cols.entries()) {
            if (typeof col === 'undefined' || col === '') {
              col = '__nocolumn__';
            }
            row[col] = r[index] as string;
          }
          return row;
        });
      },
      error: (error) => {
        csv.value.error = error.message;
      },
    });

    isLoading.value = false;
  }
});
</script>

<template>
  <el-tag v-if="csv.error">Cannot preview CSV file: {{ csv.error }} </el-tag>
  <el-table v-else v-loading="isLoading" :data="csv.data" style="width: 100%">
    <el-table-column v-for="guessedColumn of csv.cols" :prop="guessedColumn" :label="guessedColumn"></el-table-column>
  </el-table>
</template>
