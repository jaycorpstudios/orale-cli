import { Box, Text, useStdout } from 'ink';
import React from 'react';
import type { Task, TaskStatus } from '../../core/task.js';
import type { ActiveRun } from '../store.js';
import { TaskCard } from './TaskCard.js';

const COLUMN_LABEL: Record<TaskStatus, string> = {
  todo: ' TODO ',
  'in-progress': ' IN PROGRESS ',
  'code-review': ' CODE REVIEW ',
  done: ' DONE ',
  blocked: ' BLOCKED ',
  failed: ' FAILED ',
};

const COLUMN_COLOR: Record<TaskStatus, string> = {
  todo: 'gray',
  'in-progress': 'yellow',
  'code-review': 'cyan',
  done: 'green',
  blocked: 'magenta',
  failed: 'red',
};

const CARD_HEIGHT_ESTIMATE = 5;
const COLUMN_CHROME = 12;

interface Props {
  status: TaskStatus;
  tasks: Task[];
  isActive: boolean;
  activeRowIndex: number;
  activeRuns: Map<string, ActiveRun>;
}

export function Column({ status, tasks, isActive, activeRowIndex, activeRuns }: Props) {
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  const viewportSize = Math.max(2, Math.floor((termRows - COLUMN_CHROME) / CARD_HEIGHT_ESTIMATE));

  const totalTasks = tasks.length;
  const maxScrollOffset = Math.max(0, totalTasks - viewportSize);
  const scrollOffset = Math.max(0, Math.min(activeRowIndex - 1, maxScrollOffset));
  const visibleTasks = tasks.slice(scrollOffset, scrollOffset + viewportSize);

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + viewportSize < totalTasks;
  const hasOverflow = totalTasks > viewportSize;

  const label = COLUMN_LABEL[status];
  const color = COLUMN_COLOR[status];

  return (
    <Box flexDirection="column" width={30} marginRight={1}>
      {/* Column header */}
      <Box
        paddingX={1}
        marginBottom={0}
        borderStyle={isActive ? 'bold' : 'single'}
        borderColor={isActive ? color : 'gray'}
      >
        <Text bold color={isActive ? color : 'gray'}>
          {label}
        </Text>
        <Text dimColor color={isActive ? color : undefined}>
          {tasks.length}
        </Text>
        {hasOverflow && (
          <>
            <Box flexGrow={1} />
            <Text dimColor={!canScrollUp} color={isActive ? color : undefined}>
              ↑
            </Text>
            <Text dimColor color={isActive ? color : undefined}>
              {' '}
              {scrollOffset + 1}–{Math.min(scrollOffset + viewportSize, totalTasks)}/{
                totalTasks
              }{' '}
            </Text>
            <Text dimColor={!canScrollDown} color={isActive ? color : undefined}>
              ↓
            </Text>
          </>
        )}
      </Box>

      {/* Task cards */}
      {tasks.length === 0 ? (
        <Box paddingX={2} paddingY={1}>
          <Text dimColor>— empty —</Text>
        </Box>
      ) : (
        visibleTasks.map((task, i) => (
          <TaskCard
            key={task.id}
            task={task}
            isActive={isActive && scrollOffset + i === activeRowIndex}
            run={activeRuns.get(task.id)}
          />
        ))
      )}
    </Box>
  );
}
