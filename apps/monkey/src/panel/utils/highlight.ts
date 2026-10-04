import { shallowRef } from 'vue';
import type { createHighlighterCoreSync } from 'shiki/core';
import { loadHighlighter } from './shiki-cdn';

// Optional singleton: pending/failed CDN loads must never block source previews.
const highlighter = shallowRef<ReturnType<typeof createHighlighterCoreSync>>();
let loading: Promise<void> | undefined;
let disposed = false;

function plainText(source: string) {
  const escaped = source.replace(
    /[&<>"'\r]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '\r': '&#13;'
      })[character]!
  );
  return `<pre class="shiki github-light" style="background-color:#fff;color:#24292e"><code>${escaped}</code></pre>`;
}

export function highlightCode(source: string, lang: 'toml' | 'text' = 'toml') {
  if (lang === 'text') return plainText(source);
  if (!highlighter.value) {
    loading ??= loadHighlighter()
      .then((loaded) => {
        if (disposed) loaded.dispose();
        else highlighter.value = loaded;
      })
      .catch(() => {
        /* Keep the immediate plain-text preview when CDN loading fails. */
      });
    return plainText(source);
  }
  const endings = source.match(/\r?\n/g) ?? [];
  try {
    return (
      highlighter.value
        .codeToHtml(source, {
          lang,
          theme: 'github-light',
          transformers: [
            {
              code(node) {
                // Shiki normalizes line endings; restore them for exact source readback/copying.
                let index = 0;
                for (const child of node.children) {
                  if (child.type === 'text') child.value = endings[index++] ?? child.value;
                }
              }
            }
          ]
        })
        // Character references prevent the HTML parser from normalizing CRLF again.
        .replace(/\r/g, '&#13;')
    );
  } catch {
    return plainText(source);
  }
}

import.meta.hot?.dispose(() => {
  disposed = true;
  highlighter.value?.dispose();
});
