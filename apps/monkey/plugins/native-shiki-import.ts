import assert from 'node:assert/strict';
import type { Plugin } from 'vite';

// Monkey converts dynamic imports to SystemJS, which cannot load esm.sh's ESM.
// Hide this one native import during bundling and restore it in the final script.
export function nativeShikiImport(): Plugin {
  const marker = '__bilipackNativeShikiImport';
  return {
    name: 'bilipack:native-shiki-import',
    apply: 'build',
    enforce: 'post',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/panel/utils/shiki-cdn.ts')) return;
      const nativeImport = /\bimport\(\s*\/\*\s*@vite-ignore\s*\*\/\s*url\s*\)/;
      assert(nativeImport.test(code), 'Missing native Shiki import');
      return { code: code.replace(nativeImport, `${marker}(url)`), map: null };
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const script = bundle['bilipack.user.js'];
        assert(script, 'Missing userscript for native Shiki import');
        const code = script.type === 'chunk' ? script.code : String(script.source);
        assert(code.includes(`${marker}(`), 'Missing native Shiki import marker');
        const restored = code.replaceAll(`${marker}(`, 'import(');
        if (script.type === 'chunk') script.code = restored;
        else script.source = restored;
      }
    }
  };
}
