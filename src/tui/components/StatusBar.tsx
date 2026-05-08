import { Box, Text } from 'ink';
import React from 'react';
import type { Screen } from '../store.js';

interface Props {
  screen: Screen;
  filterMode: boolean;
  filterText: string;
}

const KANBAN_HINT =
  '[↑↓] task  [←→] column  [enter] detail  [space] run  [m] move  [/] filter  [p] projects  [?] help  [q] quit';
const DETAIL_HINT = '[esc] back  [tab] toggle  [space] run  [r] review comments';
const HELP_HINT = '[esc] or [?] close help';
const PICKER_HINT = '[↑↓] navigate  [enter] select project';

export function StatusBar({ screen, filterMode, filterText }: Props) {
  if (filterMode) {
    return (
      <Box paddingX={1} borderStyle="single" borderColor="yellow">
        <Text color="yellow">/ </Text>
        <Text bold>{filterText}</Text>
        <Text color="yellow">█</Text>
        <Text dimColor wrap="truncate">
          {' '}
          Enter confirm Esc cancel
        </Text>
      </Box>
    );
  }

  const hint =
    screen === 'detail'
      ? DETAIL_HINT
      : screen === 'help'
        ? HELP_HINT
        : screen === 'projectPicker'
          ? PICKER_HINT
          : KANBAN_HINT;

  return (
    <Box paddingX={1} borderStyle="single" borderColor="gray">
      <Text dimColor wrap="truncate">
        {hint}
      </Text>
    </Box>
  );
}
