import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({

  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NodiusEditor',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'es' : 'cjs'}.js`,
    },
    sourcemap: true,
    minify: false,
  },
});
