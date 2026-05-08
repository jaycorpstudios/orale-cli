import { Box, Text } from 'ink';
import React from 'react';
import type { Task } from '../../core/task.js';

interface Props {
  type: 'run' | 'review' | 'runAll';
  task?: Task;
  count?: number;
}

export function ConfirmDialog({ type, task, count }: Props) {
  let message: string;
  if (type === 'run' && task) {
    message = `Run task ${task.id}?  "${task.title}"`;
  } else if (type === 'review' && task) {
    message = `Address review comments for ${task.id}?  "${task.title}"`;
  } else {
    const n = count ?? 0;
    message = `Run all ${n} eligible task${n !== 1 ? 's' : ''} in batch order?`;
  }

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={0}
      marginX={1}
      marginBottom={0}
    >
      <Text color="yellow">{message} </Text>
      <Text color="green" bold>
        [y]
      </Text>
      <Text dimColor> Confirm </Text>
      <Text color="red" bold>
        [n/Esc]
      </Text>
      <Text dimColor> Cancel</Text>
    </Box>
  );
}
