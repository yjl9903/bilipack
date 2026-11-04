import type { Config, Position } from 'bilipack';
export interface CoverImage {
  ratio: '16:9' | '4:3';
  url: string;
  source: CoverSource;
}
export type CoverSource = {
  file: File;
  width: number;
  height: number;
} & ({ mode: 'single'; position: Position } | { mode: 'dual' });
export interface Prepared {
  raw: string;
  config: Readonly<Config>;
  covers: CoverImage[];
  subtitles: { part: number; language: string; file: File; source: string }[];
  videos: { part: number; path?: string; title?: string; file?: File }[];
}

export interface PreparationConditions {
  requireVideo: boolean;
}
