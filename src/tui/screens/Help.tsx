import { Box, Text, useStdin } from 'ink';
import React from 'react';
import { VERSION } from '../../version.js';
import { KeyboardHandler } from '../components/KeyboardHandler.js';
import { useOraleStore } from '../store.js';

const SHORTCUTS = [
  {
    section: 'Navigation',
    items: [
      ['↓ / ↑', 'Move between tasks in column'],
      ['→ / ←', 'Move between columns'],
      ['g / G', 'Jump to top / bottom of column'],
      ['p', 'Switch project'],
    ],
  },
  {
    section: 'Task Actions',
    items: [
      ['space', 'Run selected task (confirms before executing)'],
      ['A', 'Run all eligible tasks in batch order (confirms)'],
      ['enter', 'Open task detail'],
      ['m', 'Move task to next status (does not trigger run)'],
      ['r', 'Address PR review comments (in detail view, confirms)'],
      ['x', 'Dismiss notification'],
    ],
  },
  {
    section: 'Filter & Search',
    items: [
      ['/', 'Search — type to filter by id, title, feature'],
      ['esc', 'Clear filter or close overlay'],
    ],
  },
  {
    section: 'App',
    items: [
      ['?', 'Toggle this help screen'],
      ['q', 'Quit orale'],
    ],
  },
  {
    section: 'Detail View',
    items: [
      ['tab', 'Switch between info and log tab'],
      ['esc', 'Go back to kanban'],
    ],
  },
];

export function HelpScreen() {
  const setScreen = useOraleStore((s) => s.setScreen);
  const { isRawModeSupported } = useStdin();

  return (
    <Box flexDirection="column" padding={2} flexGrow={1}>
      {isRawModeSupported && (
        <KeyboardHandler
          onInput={(input, key) => {
            if (input === '?' || key.escape) setScreen('kanban');
          }}
        />
      )}

      <Text bold color="cyanBright">
        ⬡ orale — keyboard shortcuts
      </Text>
      <Text dimColor>Press ? or Esc to close</Text>
      <Box marginTop={1} />

      {SHORTCUTS.map(({ section, items }) => (
        <Box key={section} flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">
            {section}
          </Text>
          {items.map(([key, desc]) => (
            <Box key={key}>
              <Text color="cyan">{key.padEnd(14)}</Text>
              <Text dimColor>{desc}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text
          dimColor
        >{`orale v${VERSION} · Vim keys (hjkl) also work as secondary navigation`}</Text>
      </Box>
    </Box>
  );
}
