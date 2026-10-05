import type { PageAdapter, PageContext, Evidence } from './port';
import type { Prepared } from '../input/types';
export type Status =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'waiting'
  | 'verified'
  | 'skipped'
  | 'failed'
  | 'blocked'
  | 'unverified'
  | 'different';
export type Role = 'target' | 'condition';
export interface Result {
  id: string;
  role: Role;
  status: Status;
  skipReason?: 'unsupported' | 'dependency';
  message: string;
  expected?: unknown;
  actual?: unknown;
}
export interface RunContext {
  prepared: Prepared;
  page: PageContext;
  adapter: PageAdapter;
  signal: AbortSignal;
}
export type Step = {
  id: string;
  role: Role;
  dependsOn: string[];
  skip?: string;
  capability?: { field: string; value?: unknown };
  /** Re-run prerequisite actions even when the previous result verified. */
  retry?: 'execute';
  /** Read-only observation hands the page back and prevents later form operations. */
  allowDuringSubmission?: boolean;
  /** Assignment can unblock dependents while a later step supplies completion evidence. */
  pendingCompletion?: { step: string; verifiedMessage: string; unverifiedMessage: string };
  repair?(context: RunContext): Promise<void>;
  verify(context: RunContext): Promise<Evidence> | Evidence;
  expected?: unknown;
} & (
  | { execute(context: RunContext): Promise<void>; group?: never }
  | { group: StepGroup; execute?: never }
);

export interface Progress {
  phase: 'execute' | 'verify' | 'observe' | 'repair' | 'compare' | 'compared';
  id?: string;
}
export interface StepGroup {
  id: string;
  execute(context: RunContext): Promise<void>;
}
