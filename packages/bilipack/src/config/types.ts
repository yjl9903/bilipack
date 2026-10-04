/** Percent of crop travel on each axis (0..100), shared by preview and native drag mapping. */
export type Position = [number, number];

export interface Config {
  video?: { file: string };
  /** Source modes: single enables native sync and uploads one original, dual disables it.
   * wide = personal space (16:9), standard = home recommendation (4:3).
   * Schema validity does not imply support by the current page adapter.
   */
  cover?:
    | { mode: 'single'; file: string; wide_position: Position; standard_position: Position }
    | { mode: 'dual'; wide_file: string; standard_file: string };
  info?: {
    title?: string;
    declaration?: string;
    no_reprint?: boolean;
    category?: string;
    tags?: string[];
    topic?: string;
    description?: string;
  };
  publish?: { scheduled?: boolean; at?: string; collection?: string };
  display?: {
    watermark?: boolean;
    visibility?: '公开可见' | '仅自己可见';
    hide_from_profile?: boolean;
  };
  commercial?: { enabled?: boolean };
  media?: { dolby_audio?: boolean; hires_audio?: boolean; panorama?: boolean };
  interaction?: {
    dynamic?: string;
    comments?: boolean;
    danmaku?: boolean;
    selected_comments?: boolean;
  };
  subtitles?: { file: string; language: string }[];
}

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
