import { ROCrate } from 'ro-crate';
import type { RoCrate } from './types.js';

// ro-crate exposes this CJS named export in Node and Vite. Keep interop here.
export const parseRoCrate = (payload: object): RoCrate => {
  const root = new ROCrate(payload, { array: true, link: true }).rootDataset;
  if (!root) {
    throw new Error('RO-Crate has no root dataset');
  }
  return root as unknown as RoCrate;
};

export const parseRoCrateGraph = (payload: object): object[] =>
  new ROCrate(payload, { array: true, link: true }).getGraph();
