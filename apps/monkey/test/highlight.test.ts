import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import toml from 'shiki/langs/toml.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

const { loadHighlighter } = vi.hoisted(() => ({ loadHighlighter: vi.fn() }));
vi.mock('../src/panel/utils/shiki-cdn', () => ({ loadHighlighter }));
let app: App | undefined;

beforeEach(() => {
  vi.resetModules();
  loadHighlighter.mockReset();
});
afterEach(() => app?.unmount());

async function mount(source: string, language: 'toml' | 'text' = 'toml') {
  const { default: CodePreview } = await import('../src/panel/components/ui/CodePreview.vue');
  const host = document.createElement('div');
  app = createApp(CodePreview, { source, language });
  app.mount(host);
  return host;
}

it('shows safe exact text while loading, then reactively applies highlighting', async () => {
  let resolve!: (value: ReturnType<typeof createHighlighterCoreSync>) => void;
  loadHighlighter.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const source = '# comment\r\n[info]\r\ntitle = "<img src=x onerror=alert(1)>"\r\n\r\n';
  const host = await mount(source);
  expect(host.querySelector('code')?.textContent).toBe(source);
  expect(host.querySelector('span,img')).toBeNull();
  const highlighter = createHighlighterCoreSync({
    langs: [toml],
    themes: [githubLight],
    engine: createJavaScriptRegexEngine()
  });
  try {
    resolve(highlighter);
    await vi.waitFor(() => expect(host.querySelector('code span')).not.toBeNull());
    expect(host.querySelector('code')?.textContent).toBe(source);
    expect(host.querySelector('img')).toBeNull();
    expect(loadHighlighter).toHaveBeenCalledTimes(1);
  } finally {
    app?.unmount();
    app = undefined;
    highlighter.dispose();
  }
});

it('keeps plain text after CDN failure and updates source without retrying', async () => {
  loadHighlighter.mockRejectedValue(new Error('CDN unavailable'));
  const source = '<script>alert(1)</script>\r\n&\r\n';
  const host = await mount(source);
  await nextTick();
  await nextTick();
  expect(host.querySelector('code')?.textContent).toBe(source);
  expect(host.querySelector('script,span')).toBeNull();
  const { highlightCode } = await import('../src/panel/utils/highlight');
  const updated = document.createElement('div');
  updated.innerHTML = highlightCode('title = "updated"\r\n');
  expect(updated.querySelector('code')?.textContent).toBe('title = "updated"\r\n');
  expect(loadHighlighter).toHaveBeenCalledTimes(1);
});

it('renders subtitles as plain text without requesting Shiki', async () => {
  const source = '1\r\n00:00:00,000 --> 00:00:01,000\r\n<img src=x>\r\n';
  const host = await mount(source, 'text');
  expect(host.querySelector('code')?.textContent).toBe(source);
  expect(host.querySelector('img')).toBeNull();
  expect(loadHighlighter).not.toHaveBeenCalled();
});

it('falls back to plain text if highlighting throws after loading', async () => {
  loadHighlighter.mockResolvedValue({
    codeToHtml: () => {
      throw new Error('Invalid grammar');
    }
  });
  const source = '[info]\r\ntitle = "&<>"\r\n';
  const host = await mount(source);
  await nextTick();
  await nextTick();
  expect(host.querySelector('code')?.textContent).toBe(source);
  expect(host.querySelector('code span')).toBeNull();
});
