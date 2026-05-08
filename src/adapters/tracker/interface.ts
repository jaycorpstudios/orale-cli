import type { PreflightResult } from '../storage/interface.js';

export type PrMergeable = 'mergeable' | 'conflicting' | 'unknown';
export type PrState = 'open' | 'closed' | 'merged';

export interface PrStatus {
  state: PrState;
  mergedAt?: string;
  mergeable: PrMergeable;
}

export interface ReviewComment {
  body: string;
  path?: string;
  line?: number;
  author: string;
  createdAt: string;
}

export interface ReviewThread {
  isResolved: boolean;
  comments: ReviewComment[];
}

export interface TrackerAdapter {
  readonly name: string;
  preflight(): Promise<PreflightResult>;
  getPrState(prUrl: string): Promise<PrStatus | null>;
  fetchUnresolvedReviewComments(prUrl: string): Promise<ReviewThread[]>;
}
