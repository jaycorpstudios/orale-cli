import { Box, type Key, Text, useStdin } from 'ink';
import React, { useEffect, useCallback } from 'react';
import type { StorageAdapter } from '../../adapters/storage/interface.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { KeyboardHandler } from '../components/KeyboardHandler.js';
import { LogPane } from '../components/LogPane.js';
import { useRunTask } from '../hooks/useRunTask.js';
import { EMPTY_LOGS, useOraleStore } from '../store.js';

interface Props {
  storage: StorageAdapter | null;
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'gray',
  'in-progress': 'yellow',
  'code-review': 'cyan',
  done: 'green',
  blocked: 'magenta',
  failed: 'red',
};

const STATUS_ICON: Record<string, string> = {
  todo: '○',
  'in-progress': '◉',
  'code-review': '◎',
  done: '●',
  blocked: '⊘',
  failed: '✗',
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];

export function TaskDetailScreen({ storage: _storage }: Props) {
  // Select by ID, not by task object reference, to avoid closure re-creation issues
  const selectedTaskId = useOraleStore((s) => s.selectedTaskId);

  // Derive task from ID — stable selector
  const task = useOraleStore((s) =>
    s.selectedTaskId ? (s.tasks.find((t) => t.id === s.selectedTaskId) ?? null) : null,
  );

  // Stable log selector — uses EMPTY_LOGS constant when no logs exist
  const logs = useOraleStore((s) =>
    selectedTaskId ? (s.logs.get(selectedTaskId) ?? EMPTY_LOGS) : EMPTY_LOGS,
  );

  // Stable run selector
  const run = useOraleStore((s) => (selectedTaskId ? s.activeRuns.get(selectedTaskId) : undefined));

  const detailTab = useOraleStore((s) => s.detailTab);
  const setDetailTab = useOraleStore((s) => s.setDetailTab);
  const closeDetail = useOraleStore((s) => s.closeDetail);
  const tickRuns = useOraleStore((s) => s.tickRuns);
  const addNotification = useOraleStore((s) => s.addNotification);
  const confirmPending = useOraleStore((s) => s.confirmPending);
  const setConfirm = useOraleStore((s) => s.setConfirm);
  const clearConfirm = useOraleStore((s) => s.clearConfirm);
  const { isRawModeSupported } = useStdin();

  const { runTask, addressReviewComments } = useRunTask();

  // Tick timer — only re-creates interval if tickRuns changes (it won't: stable zustand action)
  useEffect(() => {
    const interval = setInterval(tickRuns, 100);
    return () => clearInterval(interval);
  }, [tickRuns]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      // ── Confirm dialog intercept ──────────────────────────────────────────
      if (confirmPending) {
        if (input === 'y' || input === 'Y') {
          confirmPending.onConfirm();
          clearConfirm();
          return;
        }
        if (input === 'n' || input === 'N' || key.escape) {
          clearConfirm();
          return;
        }
        return;
      }

      if (key.escape) {
        closeDetail();
        return;
      }
      if (key.tab) {
        setDetailTab(detailTab === 'info' ? 'log' : 'info');
        return;
      }
      if (input === ' ' && task) {
        setConfirm({ type: 'run', task, onConfirm: () => void runTask(task) });
        return;
      }
      if (input === 'r' && task) {
        if (task.status !== 'code-review') {
          addNotification('Task is not in code-review', 'warn', task.id);
          return;
        }
        setConfirm({ type: 'review', task, onConfirm: () => void addressReviewComments(task) });
        return;
      }
    },
    [
      confirmPending,
      clearConfirm,
      setConfirm,
      closeDetail,
      setDetailTab,
      detailTab,
      task,
      runTask,
      addressReviewComments,
      addNotification,
    ],
  );

  if (!task) {
    return (
      <Box flexDirection="column" padding={2}>
        {isRawModeSupported && (
          <KeyboardHandler
            onInput={(_, key) => {
              if (key.escape) closeDetail();
            }}
          />
        )}
        <Text color="red">Task not found</Text>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    );
  }

  const statusColor = STATUS_COLOR[task.status] ?? 'white';
  const statusIcon = STATUS_ICON[task.status] ?? '·';
  const isRunning = Boolean(run);
  const spinnerFrame = isRunning
    ? SPINNER_FRAMES[Math.floor(run!.elapsedMs / 100) % SPINNER_FRAMES.length]
    : null;
  const elapsedSec = isRunning ? Math.floor(run!.elapsedMs / 1000) : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {isRawModeSupported && <KeyboardHandler onInput={handleInput} />}

      {/* Confirm dialog */}
      {confirmPending && (
        <ConfirmDialog
          type={confirmPending.type}
          task={confirmPending.task}
          count={confirmPending.count}
        />
      )}

      {/* ── Header bar ─────────────────────────────────────── */}
      <Box paddingX={1} paddingY={0} borderStyle="single" borderColor="cyan" marginBottom={0}>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text bold>{task.id}</Text>
        <Text dimColor> — </Text>
        <Text>{task.title}</Text>
        <Box flexGrow={1} />
        <Text dimColor>esc back · tab toggle</Text>
      </Box>

      {/* ── Meta row ───────────────────────────────────────── */}
      <Box paddingX={2} marginTop={0} marginBottom={1}>
        <Text color={statusColor} bold>
          {task.status}
        </Text>
        <Text dimColor> batch {task.batch}</Text>
        {task.tracker_ticket ? (
          <>
            <Text dimColor> </Text>
            <Text color="blue">{task.tracker_ticket}</Text>
          </>
        ) : null}
        {task.feature ? (
          <>
            <Text dimColor> </Text>
            <Text dimColor>{task.feature}</Text>
          </>
        ) : null}
        {isRunning ? (
          <>
            <Text dimColor> </Text>
            <Text color="yellow">
              {spinnerFrame} {elapsedSec}s
            </Text>
          </>
        ) : null}
      </Box>

      {/* ── PR / Branch / Deps ─────────────────────────────── */}
      <Box flexDirection="column" paddingX={2} marginBottom={1}>
        {task.pr_url ? (
          <Box>
            <Text dimColor bold>
              PR{' '}
            </Text>
            <Text color="cyan">{task.pr_url}</Text>
          </Box>
        ) : null}
        {task.branch_name ? (
          <Box>
            <Text dimColor bold>
              Branch{' '}
            </Text>
            <Text>{task.branch_name}</Text>
          </Box>
        ) : null}
        {task.dependencies.length > 0 ? (
          <Box>
            <Text dimColor bold>
              Deps{' '}
            </Text>
            <Text>{task.dependencies.join(', ')}</Text>
          </Box>
        ) : null}
        {task.error ? (
          <Box>
            <Text color="red" bold>
              Error{' '}
            </Text>
            <Text color="red">{task.error}</Text>
          </Box>
        ) : null}
      </Box>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <Box paddingX={2} marginBottom={0}>
        <Text
          bold={detailTab === 'info'}
          color={detailTab === 'info' ? 'cyan' : undefined}
          underline={detailTab === 'info'}
          dimColor={detailTab !== 'info'}
        >
          TASK BODY
        </Text>
        <Text dimColor> </Text>
        <Text
          bold={detailTab === 'log'}
          color={detailTab === 'log' ? 'cyan' : undefined}
          underline={detailTab === 'log'}
          dimColor={detailTab !== 'log'}
        >
          AGENT LOG {logs.length > 0 ? `(${logs.length} lines)` : ''}
        </Text>
      </Box>

      {/* ── Content ────────────────────────────────────────── */}
      {detailTab === 'info' ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
          flexGrow={1}
          marginX={1}
        >
          {task.body ? (
            task.body.split('\n').map((line, i) => (
              <Text
                key={i}
                bold={line.startsWith('## ')}
                color={line.startsWith('## ') ? 'yellow' : undefined}
                dimColor={
                  !line.startsWith('## ') && !line.startsWith('- [') && !line.startsWith('1.')
                }
              >
                {line}
              </Text>
            ))
          ) : (
            <Text dimColor>No task body</Text>
          )}
        </Box>
      ) : (
        <Box flexGrow={1} marginX={1}>
          <LogPane lines={logs} />
        </Box>
      )}

      {/* ── Action hints ───────────────────────────────────── */}
      <Box paddingX={2} paddingY={0}>
        {task.status === 'todo' || task.status === 'failed' ? (
          <Text dimColor>[space] run task </Text>
        ) : null}
        {task.status === 'code-review' ? <Text dimColor>[r] address review comments </Text> : null}
        {task.status === 'in-progress' && !isRunning ? (
          <Text dimColor>[space] resume task </Text>
        ) : null}
      </Box>
    </Box>
  );
}
