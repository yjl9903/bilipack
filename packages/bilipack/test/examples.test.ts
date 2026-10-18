import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseConfig } from '../src';
it('parses every product example', () => {
  const doc = readFileSync(new URL('../../../docs/intent/README.md', import.meta.url), 'utf8');
  const examples = [...doc.matchAll(/```toml\n([\s\S]*?)```/g)];
  expect(examples.length).toBe(4);
  for (const [, source] of examples) expect(() => parseConfig(source)).not.toThrow();
});
