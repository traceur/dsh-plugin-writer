import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client/index.tsx',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
})
