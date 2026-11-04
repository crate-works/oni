import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['src/configuration.ts', 'scripts/*.mts', 'src/assets/main.css', 'src/__tests__/*'],
    },
    'packages/oni-client': {},
  },
  ignoreDependencies: [
    '@tsconfig/node-lts',
    '@total-typescript/ts-reset',
    // Loaded by semantic-release via `preset: 'conventionalcommits'`
    'conventional-changelog-conventionalcommits',
  ],
  compilers: {
    // For tailwind
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/g)].join('\n'),
  },
};

export default config;
