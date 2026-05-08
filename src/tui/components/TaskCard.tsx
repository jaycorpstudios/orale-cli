import { Box, Text } from 'ink';
import React from 'react';
import type { Task, TaskStatus } from '../../core/task.js';
import type { ActiveRun } from '../store.js';

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: '○',
  'in-progress': '◉',
  'code-review': '◎',
  done: '●',
  blocked: '⊘',
  failed: '✗',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'gray',
  'in-progress': 'yellow',
  'code-review': 'cyan',
  done: 'green',
  blocked: 'magenta',
  failed: 'red',
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Inner width = card width (28) minus 2 border chars
const HEADER_WIDTH = 26;

function elapsedStr(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

interface Props {
  task: Task;
  isActive: boolean;
  run?: ActiveRun;
}

export function TaskCard({ task, isActive, run }: Props) {
  const statusColor = STATUS_COLOR[task.status] ?? 'white';
  const statusIcon = STATUS_ICON[task.status] ?? '·';
  const isRunning = Boolean(run);
  const spinnerFrame = isRunning
    ? SPINNER[Math.floor(run!.elapsedMs / 100) % SPINNER.length]
    : null;

  const branchShort = task.branch_name
    ? task.branch_name.replace(/^feature\//, '').slice(0, 24)
    : null;

  const prNumber = task.pr_url?.match(/\/(\d+)$/)?.[1];

  const headerText = ` ${task.id}`.padEnd(HEADER_WIDTH);

  return (
    <Box
      flexDirection="column"
      borderStyle={isActive ? 'bold' : 'single'}
      borderColor={statusColor}
      marginBottom={0}
      width={28}
    >
      {/* Header: filled bar with task ID, inverted colors — dimmed when inactive for pastel effect */}
      <Text inverse bold color={statusColor} dimColor={!isActive}>
        {headerText}
      </Text>

      {/* Body: title + deps */}
      <Box flexDirection="column" paddingX={1}>
        <Text wrap="truncate" dimColor={!isActive}>
          {task.title}
        </Text>

        {task.dependencies.length > 0 ? (
          <Text dimColor wrap="truncate">
            ↳ {task.dependencies.join(', ')}
          </Text>
        ) : null}
      </Box>

      {/* Footer: branch/PR/ticket on left, status icon/spinner on right */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          {task.tracker_ticket ? (
            <Text color="blue" dimColor={!isActive}>
              {task.tracker_ticket}
            </Text>
          ) : prNumber ? (
            <Text color="cyan" dimColor={!isActive}>
              PR#{prNumber}
            </Text>
          ) : branchShort ? (
            <Text dimColor>{branchShort}</Text>
          ) : null}
        </Box>

        <Box>
          {isRunning ? (
            <Text color="yellow">
              {spinnerFrame} {elapsedStr(run!.elapsedMs)}
            </Text>
          ) : (
            <Text color={statusColor}>{statusIcon}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
