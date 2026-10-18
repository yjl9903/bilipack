import { expect, it } from 'vitest';
import { scheduleInstant, scheduleParts } from '../src/bilibili/schedule';
import { matches } from '../src/bilibili/fields';

it.each([
  ['2026-10-20T10:30:00Z', '2026-10-20', '18', '30'],
  ['2026-12-31T23:45:00-05:00', '2027-01-01', '12', '45'],
  ['2028-02-29T00:00:00+14:00', '2028-02-28', '18', '00']
])(
  'converts %s to native Beijing fields without changing the instant',
  (input, date, hour, minute) => {
    expect(scheduleParts(input)).toEqual({ date, hour, minute });
    const actual = scheduleInstant(date, `${hour}:${minute}`, '(UTC+08:00) Beijing');
    expect(matches('publish.at', actual, input)).toBe(true);
  }
);

it.each([
  '2026-10-20T10:30:01Z',
  '2026-10-20T10:30:00.001Z',
  '2026-10-20T10:30:00.0001Z',
  'invalid'
])('rejects an instant the native picker cannot represent instead of rounding: %s', (input) =>
  expect(() => scheduleParts(input)).toThrow('分钟精度')
);

it('keeps arbitrary whole minutes for the native menu to accept or explicitly reject', () => {
  expect(scheduleParts('2026-10-20T10:31:00Z').minute).toBe('31');
  expect(scheduleInstant('2026-10-20', '10:30', '(UTC-03:30) test')).toBe(
    '2026-10-20T14:00:00.000Z'
  );
  expect(() => scheduleInstant('2026-10-20', '10:30', 'unknown')).toThrow('时区');
  expect(matches('publish.at', 'invalid', 'invalid')).toBe(false);
  expect(matches('publish.at', '2026-10-20T10:30:00.000Z', '2026-10-20T10:30:00.0001Z')).toBe(
    false
  );
  expect(matches('publish.at', '2026-10-20T10:30:00Z', '2026-10-20T10:31:00Z')).toBe(false);
});
