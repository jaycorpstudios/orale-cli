import { execa } from 'execa';
import type { ResolvedConfig } from '../../config/schema.js';
import type { PreflightResult } from '../storage/interface.js';
import type { PrStatus, ReviewThread, TrackerAdapter } from './interface.js';

interface GHPRView {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergedAt: string | null;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

interface GQLComment {
  body: string;
  path?: string;
  line?: number;
  originalLine?: number;
  author: { login: string };
  createdAt: string;
}

interface GQLThread {
  isResolved: boolean;
  comments: { nodes: GQLComment[] };
}

interface GQLResponse {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: { nodes: GQLThread[] };
      };
    };
  };
}

function parsePRUrl(prUrl: string): { owner: string; repo: string; number: number } {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Cannot parse PR URL: ${prUrl}`);
  return { owner: match[1], repo: match[2], number: Number.parseInt(match[3], 10) };
}

export class GitHubTrackerAdapter implements TrackerAdapter {
  readonly name = 'github';
  private ghPath: string;

  constructor(config: ResolvedConfig) {
    this.ghPath = config.tracker.ghPath;
  }

  async preflight(): Promise<PreflightResult> {
    try {
      await execa(this.ghPath, ['auth', 'status']);
      return { ok: true, message: 'GitHub CLI is authenticated' };
    } catch {
      return {
        ok: false,
        message: `GitHub CLI (gh) not found or not authenticated. Run: ${this.ghPath} auth login`,
      };
    }
  }

  async getPrState(prUrl: string): Promise<PrStatus | null> {
    try {
      const result = await execa(this.ghPath, [
        'pr',
        'view',
        prUrl,
        '--json',
        'state,mergedAt,mergeable',
      ]);
      const data = JSON.parse(result.stdout.trim()) as GHPRView;
      return {
        state: data.state === 'MERGED' ? 'merged' : data.state === 'CLOSED' ? 'closed' : 'open',
        mergedAt: data.mergedAt ?? undefined,
        mergeable:
          data.mergeable === 'MERGEABLE'
            ? 'mergeable'
            : data.mergeable === 'CONFLICTING'
              ? 'conflicting'
              : 'unknown',
      };
    } catch {
      return null;
    }
  }

  async fetchUnresolvedReviewComments(prUrl: string): Promise<ReviewThread[]> {
    const { owner, repo, number } = parsePRUrl(prUrl);

    const query = `{
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${number}) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
              comments(first: 50) {
                nodes {
                  body
                  path
                  line
                  originalLine
                  author { login }
                  createdAt
                }
              }
            }
          }
        }
      }
    }`;

    const result = await execa(this.ghPath, ['api', 'graphql', '-f', `query=${query}`]);
    const response = JSON.parse(result.stdout.trim()) as GQLResponse;
    const threads = response.data.repository.pullRequest.reviewThreads.nodes;

    return threads
      .filter((t) => !t.isResolved)
      .map((t) => ({
        isResolved: t.isResolved,
        comments: t.comments.nodes.map((c) => ({
          body: c.body,
          path: c.path,
          line: c.line ?? c.originalLine,
          author: c.author.login,
          createdAt: c.createdAt,
        })),
      }));
  }

  formatThreadsForPrompt(threads: ReviewThread[]): string {
    if (threads.length === 0) return '(none)';

    return threads
      .map((thread, i) => {
        const first = thread.comments[0];
        const location = first.path
          ? `\`${first.path}\`${first.line ? ` line ${first.line}` : ''}`
          : 'General comment';

        const discussion = thread.comments.map((c) => `  **@${c.author}**: ${c.body}`).join('\n');

        return `### Thread ${i + 1} — ${location}\n\n${discussion}`;
      })
      .join('\n\n---\n\n');
  }
}
