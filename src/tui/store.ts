import { basename } from 'node:path';
import { cwd } from 'node:process';
import { create } from 'zustand';
import type { ResolvedConfig } from '../config/schema.js';
import type { Task, TaskStatus } from '../core/task.js';

export type Screen = 'splash' | 'projectPicker' | 'kanban' | 'detail' | 'help';

export const COLUMN_ORDER: TaskStatus[] = ['todo', 'in-progress', 'code-review', 'done'];

export interface ActiveRun {
  taskId: string;
  startTime: number;
  elapsedMs: number;
}

export interface Notification {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'warn' | 'error';
  taskId?: string;
}

export interface ProjectInfo {
  path: string;
  name: string;
  taskCount: number;
}

export interface ConfirmPending {
  type: 'run' | 'review' | 'runAll';
  task?: Task;
  count?: number;
  onConfirm: () => void;
}

// Stable empty array — never create new [] in selectors
const EMPTY_LOGS: string[] = [];

interface OraleState {
  tasks: Task[];
  config: ResolvedConfig | null;
  projectRoot: string | null;
  loading: boolean;
  error: string | null;

  // Project selection
  selectedProject: string | null;
  projectCursor: number;

  // Navigation
  activeColumn: TaskStatus;
  activeRowIndex: number;
  screen: Screen;
  selectedTaskId: string | null;
  detailTab: 'info' | 'log';

  // Filter
  filterText: string;
  filterMode: boolean;

  // Active runs
  activeRuns: Map<string, ActiveRun>;

  // Logs per task
  logs: Map<string, string[]>;

  // Notifications
  notifications: Notification[];

  // Confirm dialog
  confirmPending: ConfirmPending | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  setConfig: (config: ResolvedConfig, root: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setSelectedProject: (path: string | null) => void;
  moveProjectCursor: (delta: number) => void;

  selectColumn: (col: TaskStatus) => void;
  moveRow: (delta: number) => void;
  setScreen: (screen: Screen) => void;
  openDetail: (taskId: string) => void;
  closeDetail: () => void;
  setDetailTab: (tab: 'info' | 'log') => void;

  setFilterMode: (active: boolean) => void;
  appendFilter: (char: string) => void;
  clearFilter: () => void;

  startRun: (taskId: string) => void;
  stopRun: (taskId: string) => void;
  tickRuns: () => void;

  appendLog: (taskId: string, line: string) => void;
  clearLog: (taskId: string) => void;

  addNotification: (msg: string, kind: Notification['kind'], taskId?: string) => void;
  dismissNotification: (id: string) => void;
  autoDismissNotification: (id: string, delayMs?: number) => void;

  setConfirm: (pending: ConfirmPending) => void;
  clearConfirm: () => void;
}

export const useOraleStore = create<OraleState>((set, get) => ({
  tasks: [],
  config: null,
  projectRoot: null,
  loading: true,
  error: null,

  selectedProject: null,
  projectCursor: 0,

  activeColumn: 'todo',
  activeRowIndex: 0,
  screen: 'splash',
  selectedTaskId: null,
  detailTab: 'info',

  filterText: '',
  filterMode: false,

  activeRuns: new Map(),
  logs: new Map(),
  notifications: [],
  confirmPending: null,

  setTasks: (tasks) => set({ tasks }),
  setConfig: (config, root) => set({ config, projectRoot: root, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  setSelectedProject: (path) => set({ selectedProject: path, activeRowIndex: 0 }),

  moveProjectCursor: (delta) => {
    const { tasks, projectCursor } = get();
    const projects = getProjects(tasks);
    // +1 for "All projects" option
    const total = projects.length + 1;
    const next = Math.max(0, Math.min(total - 1, projectCursor + delta));
    set({ projectCursor: next });
  },

  selectColumn: (col) => set({ activeColumn: col, activeRowIndex: 0 }),

  moveRow: (delta) => {
    const { activeColumn, activeRowIndex, tasks, filterText, selectedProject } = get();
    const colTasks = getColumnTasks(tasks, activeColumn, filterText, selectedProject);
    const next = Math.max(0, Math.min(colTasks.length - 1, activeRowIndex + delta));
    set({ activeRowIndex: next });
  },

  setScreen: (screen) => set({ screen }),

  openDetail: (taskId) => set({ selectedTaskId: taskId, screen: 'detail', detailTab: 'info' }),

  closeDetail: () => set({ screen: 'kanban', selectedTaskId: null }),

  setDetailTab: (tab) => set({ detailTab: tab }),

  setFilterMode: (active) => set({ filterMode: active }),

  appendFilter: (char) => set((s) => ({ filterText: s.filterText + char, activeRowIndex: 0 })),

  clearFilter: () => set({ filterText: '', filterMode: false, activeRowIndex: 0 }),

  startRun: (taskId) =>
    set((s) => {
      const runs = new Map(s.activeRuns);
      runs.set(taskId, { taskId, startTime: Date.now(), elapsedMs: 0 });
      return { activeRuns: runs };
    }),

  stopRun: (taskId) =>
    set((s) => {
      const runs = new Map(s.activeRuns);
      runs.delete(taskId);
      return { activeRuns: runs };
    }),

  // BUG FIX: only create a new Map when there are actually active runs.
  // Previously, `new Map(s.activeRuns)` created a new Map reference every 100ms
  // even when empty, causing zustand to consider the state changed → infinite re-render.
  tickRuns: () =>
    set((s) => {
      if (s.activeRuns.size === 0) return {};
      const now = Date.now();
      const runs = new Map(s.activeRuns);
      for (const [id, run] of runs) {
        runs.set(id, { ...run, elapsedMs: now - run.startTime });
      }
      return { activeRuns: runs };
    }),

  appendLog: (taskId, line) =>
    set((s) => {
      const logs = new Map(s.logs);
      const prev = logs.get(taskId) ?? EMPTY_LOGS;
      const next = prev.length >= 500 ? [...prev.slice(-499), line] : [...prev, line];
      logs.set(taskId, next);
      return { logs };
    }),

  clearLog: (taskId) =>
    set((s) => {
      const logs = new Map(s.logs);
      logs.delete(taskId);
      return { logs };
    }),

  addNotification: (message, kind, taskId) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({
      notifications: [...s.notifications, { id, message, kind, taskId }],
    }));
    // Auto-dismiss after 6 seconds
    get().autoDismissNotification(id, 6000);
  },

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  autoDismissNotification: (id, delayMs = 6000) => {
    setTimeout(() => {
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
      }));
    }, delayMs);
  },

  setConfirm: (pending) => set({ confirmPending: pending }),
  clearConfirm: () => set({ confirmPending: null }),
}));

// ── Selectors ──────────────────────────────────────────────────────────────────

export function getProjects(tasks: Task[]): ProjectInfo[] {
  const map = new Map<string, number>();
  for (const t of tasks) {
    if (t.project) {
      map.set(t.project, (map.get(t.project) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([path, taskCount]) => ({
    path,
    name: basename(path),
    taskCount,
  }));
}

export function detectProject(tasks: Task[]): string | null {
  const currentDir = cwd();
  const projects = getProjects(tasks);
  const match = projects.find((p) => p.path === currentDir);
  return match?.path ?? null;
}

export function getColumnTasks(
  tasks: Task[],
  column: TaskStatus,
  filterText: string,
  selectedProject?: string | null,
): Task[] {
  let colTasks = tasks.filter((t) => t.status === column);

  if (selectedProject) {
    colTasks = colTasks.filter((t) => t.project === selectedProject);
  }

  if (!filterText) return colTasks;
  const lower = filterText.toLowerCase();
  return colTasks.filter(
    (t) =>
      t.id.toLowerCase().includes(lower) ||
      t.title.toLowerCase().includes(lower) ||
      (t.feature ?? '').toLowerCase().includes(lower),
  );
}

export function getActiveTask(state: OraleState): Task | null {
  const colTasks = getColumnTasks(
    state.tasks,
    state.activeColumn,
    state.filterText,
    state.selectedProject,
  );
  return colTasks[state.activeRowIndex] ?? null;
}

export function getSelectedTask(state: OraleState): Task | null {
  if (!state.selectedTaskId) return null;
  return state.tasks.find((t) => t.id === state.selectedTaskId) ?? null;
}

export { EMPTY_LOGS };
