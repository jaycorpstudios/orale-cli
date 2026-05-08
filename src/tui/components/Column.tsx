import { Box, Text } from 'ink';
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

interface Props {
  status: TaskStatus;
  tasks: Task[];
  isActive: boolean;
  activeRowIndex: number;
  activeRuns: Map<string, ActiveRun>;
}

export function Column({ status, tasks, isActive, activeRowIndex, activeRuns }: Props) {
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
      </Box>

      {/* Task cards */}
      {tasks.length === 0 ? (
        <Box paddingX={2} paddingY={1}>
          <Text dimColor>— empty —</Text>
        </Box>
      ) : (
        tasks.map((task, i) => (
          <TaskCard
            key={task.id}
            task={task}
            isActive={isActive && i === activeRowIndex}
            run={activeRuns.get(task.id)}
          />
        ))
      )}
    </Box>
  );
}
