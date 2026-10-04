import type { CoverImage } from '../input/types';
import type { Result, Progress } from '../workflow/types';
interface AttachmentMetadata {
  name: string;
  size: number;
  kind: string;
}
export type VideoAttachment = AttachmentMetadata & { type: 'video'; file: File };
export type CoverAttachment = AttachmentMetadata & {
  type: 'cover';
  cover: Pick<CoverImage, 'ratio' | 'source'>;
  url: string;
};
export type SubtitleAttachment = AttachmentMetadata & {
  type: 'subtitle';
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
  | 'submission-wait'
  | 'completed'
  | 'attention'
  | 'error'
  | 'interrupted';

export type ApplicationProgress =
  Progress | { phase: 'pick' | 'drop' | 'read-config' | 'prepare' | 'check-page' };
