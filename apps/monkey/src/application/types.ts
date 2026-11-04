import type { CoverImage } from '../input/types';
import type { Result, Progress } from '../workflow/types';
export type VideoAttachment = {
  type: 'video';
  name: string;
  file: File;
  part: number;
  title?: string;
};
export type CoverAttachment = {
  type: 'cover';
  cover: Pick<CoverImage, 'ratio' | 'source'>;
  url: string;
};
export type SubtitleAttachment = {
  type: 'subtitle';
  name: string;
  part: number;
  source: string;
  language: string;
};
export type Attachment = VideoAttachment | CoverAttachment | SubtitleAttachment;
export interface ViewState {
  directoryName: string | null;
  visible: boolean;
  panelVisible?: boolean;
  panelInitiallyExpanded?: boolean;
  busy: boolean;
  panelStatus?: PanelStatus;
  currentStep?: ApplicationProgress;
  comparison?: boolean;
  canWrite?: boolean;
  raw: string | null;
  attachments: Attachment[];
  results: Result[];
  summary: string;
}

export type PanelStatus =
  | 'preparing'
  | 'comparing'
  | 'awaiting-write'
  | 'executing'
  | 'video-wait'
  | 'completed'
  | 'attention'
  | 'error'
  | 'interrupted';

export type ApplicationProgress =
  Progress | { phase: 'pick' | 'drop' | 'read-config' | 'prepare' | 'check-page' };
