import type { createHighlighterCoreSync } from 'shiki/core';

export async function loadHighlighter() {
  const load = (path: string) => {
    const url = `https://esm.sh/shiki@4.5.0/${path}`;
    return import(/* @vite-ignore */ url);
  };
  const [core, engine, language, theme] = await Promise.all([
    load('core'),
    load('engine/javascript'),
    load('langs/toml.mjs'),
    load('themes/github-light.mjs')
  ]);
  return core.createHighlighterCoreSync({
    langs: [language.default],
    themes: [theme.default],
    engine: engine.createJavaScriptRegexEngine()
  }) as ReturnType<typeof createHighlighterCoreSync>;
}
