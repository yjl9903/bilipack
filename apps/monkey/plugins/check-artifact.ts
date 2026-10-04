import assert from 'node:assert/strict';
import type { Plugin } from 'vite';

export function checkArtifact(version: string, externalRequires: ReadonlySet<string>): Plugin {
  return {
    name: 'bilipack:check-artifact',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      // Validate after vite-plugin-monkey emits the userscript and metadata.
      order: 'post',
      handler(_options, bundle) {
        const readArtifact = (fileName: string) => {
          const output = Object.values(bundle).find((file) => file.fileName === fileName);
          assert(output, `Missing artifact: ${fileName}`);
          return output.type === 'chunk'
            ? output.code
            : typeof output.source === 'string'
              ? output.source
              : new TextDecoder().decode(output.source);
        };
        const code = readArtifact('bilipack.user.js');
        const meta = readArtifact('bilipack.meta.js');
        const header = code.match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)?.[0];
        assert(header, 'Missing userscript metadata');
        assert.equal(meta.trim(), header.trim());
        assert.match(header, new RegExp('@version\\s+' + version.replaceAll('.', '\\.')));
        assert.match(header, /@match\s+https:\/\/member\.bilibili\.com\/\*/);
        assert(
          [...header.matchAll(/@grant\s+([^\n]+)/g)].every(([, grant]) => grant.trim() === 'none'),
          'Unexpected GM permission'
        );
        assert.match(header, /@noframes/);
        for (const [key, file] of [
          ['updateURL', 'bilipack.meta.js'],
          ['downloadURL', 'bilipack.user.js']
        ]) {
          const values: RegExpMatchArray[] = [
            ...header.matchAll(new RegExp(`@${key}\\s+([^\\r\\n]+)`, 'g'))
          ];
          assert.equal(values.length, 1, `Expected one @${key}`);
          assert.equal(
            values[0][1].trim(),
            `https://github.com/yjl9903/bilipack/releases/latest/download/${file}`
          );
        }
        assert(!/@(?:resource|connect)\s/.test(header), 'Unexpected remote resource or permission');
        const requires = [...header.matchAll(/@require\s+([^\r\n]+)/g)].map(([, url]) =>
          url.trim()
        );
        assert.equal(externalRequires.size, 2, 'Expected Vue and diff external libraries');
        assert.deepEqual(
          requires.toSorted(),
          [...externalRequires].toSorted(),
          'Unexpected external libraries'
        );
        assert(code.includes('https://esm.sh/shiki@4.5.0/'), 'Missing pinned Shiki CDN');
        assert.match(code, /\bimport\(\s*url\s*\)/, 'Missing native Shiki import');
        assert(
          !/System\.register|__bilipackNativeShikiImport|class ShikiError|var ShikiError/.test(
            code
          ),
          'Unexpected SystemJS loader or inline Shiki runtime'
        );
        assert(
          !/localhost|127\.0\.0\.1|@vite\/client|node:(?:fs|path|crypto)|unsafeWindow/.test(code),
          'Unexpected development or Node dependency'
        );
        console.log('Userscript metadata, permissions and bundled artifact verified');
      }
    }
  };
}
