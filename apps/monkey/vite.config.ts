import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import monkey from 'vite-plugin-monkey';
import { checkArtifact } from './plugins/check-artifact.ts';
import { nativeShikiImport } from './plugins/native-shiki-import.ts';

import pkg from './package.json' with { type: 'json' };

const externalRequires = new Set<string>();
function libraryUrl(name: string, version: string, file: string) {
  const url = `https://registry.npmmirror.com/${name}/${version}/files/dist/${file}`;
  externalRequires.add(url);
  return url;
}

export default defineConfig({
  optimizeDeps: { exclude: ['bilipack'] },
  plugins: [
    vue(),
    // Vitest shares Vue transforms but does not need userscript tooling.
    !process.env.VITEST &&
      monkey({
        entry: 'src/main.ts',
        userscript: {
          name: 'Bilipack',
          namespace: 'https://github.com/yjl9903/bilipack',
          version: pkg.version,
          updateURL:
            'https://github.com/yjl9903/bilipack/releases/latest/download/bilipack.meta.js',
          downloadURL:
            'https://github.com/yjl9903/bilipack/releases/latest/download/bilipack.user.js',
          description: '从视频包填写 B 站投稿信息并核验结果',
          match: ['https://member.bilibili.com/*'],
          'run-at': 'document-idle',
          noframes: true
        },
        server: { open: false, prefix: (name) => `dev: ${name}`, mountGmApi: false },
        build: {
          fileName: 'bilipack.user.js',
          metaFileName: true,
          autoGrant: true,
          systemjs: 'inline',
          externalGlobals: {
            vue: ['Vue', (version) => libraryUrl('vue', version, 'vue.runtime.global.prod.js')],
            diff: ['Diff', (version) => libraryUrl('diff', version, 'diff.js')]
          }
        }
      }),
    !process.env.VITEST && nativeShikiImport(),
    !process.env.VITEST && checkArtifact(pkg.version, externalRequires)
  ],
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] }
});
