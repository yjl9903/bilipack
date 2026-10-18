import { it, expect } from 'vitest';
import { parseSrt } from '../src';
it('validates SRT and preserves multiline text', () => {
  expect(parseSrt('\uFEFF1\r\n00:00:00,100 --> 00:00:01,000\r\n甲\r\n乙')[0]).toEqual({
    start: 100,
    end: 1000,
    text: '甲\n乙'
  });
});

it.each([
  '',
  'a\n00:00:00,000 --> 00:00:01,000\nx',
  '1\n00:60:00,000 --> 00:61:00,000\nx',
  '1\n00:00:02,000 --> 00:00:01,000\nx',
  '1\n00:00:01,000 --> 00:00:02,000'
])('rejects malformed SRT', (source) => expect(() => parseSrt(source)).toThrow());
