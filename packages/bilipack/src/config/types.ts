import type { z } from 'zod';
import type { configSchema, positionSchema } from './schema';

export type Position = z.infer<typeof positionSchema>;
export type Config = z.infer<typeof configSchema>;

const fieldGroups = ['info', 'publish', 'display', 'commercial', 'media', 'interaction'] as const;
type FieldGroups = Pick<Config, (typeof fieldGroups)[number]>;
export type FieldTarget = {
  [G in keyof FieldGroups]-?: {
    [K in keyof NonNullable<FieldGroups[G]>]-?: {
      field: `${G}.${K & string}`;
      value: NonNullable<NonNullable<FieldGroups[G]>[K]>;
    };
  }[keyof NonNullable<FieldGroups[G]>];
}[keyof FieldGroups];

export function fieldTargets(config: Config): FieldTarget[] {
  const result: FieldTarget[] = [];

  for (const group of fieldGroups)
    for (const [key, value] of Object.entries(config[group] ?? {}))
      result.push({ field: `${group}.${key}`, value } as FieldTarget);

  // Controls which may reveal or reset other fields go first.
  const order = ['info.category', 'info.declaration', 'publish.scheduled', 'publish.at'];

  return result.sort(
    (a, b) =>
      (order.includes(a.field) ? order.indexOf(a.field) : a.field === 'info.tags' ? 100 : 99) -
      (order.includes(b.field) ? order.indexOf(b.field) : b.field === 'info.tags' ? 100 : 99)
  );
}
