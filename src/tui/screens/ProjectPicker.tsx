import { Box, type Key, Text, useStdin } from 'ink';
import React, { useCallback } from 'react';
import { KeyboardHandler } from '../components/KeyboardHandler.js';
import { getProjects, useOraleStore } from '../store.js';

export function ProjectPickerScreen() {
  const tasks = useOraleStore((s) => s.tasks);
  const projectCursor = useOraleStore((s) => s.projectCursor);
  const moveProjectCursor = useOraleStore((s) => s.moveProjectCursor);
  const setSelectedProject = useOraleStore((s) => s.setSelectedProject);
  const setScreen = useOraleStore((s) => s.setScreen);
  const { isRawModeSupported } = useStdin();

  const projects = getProjects(tasks);
  const totalItems = projects.length + 1; // +1 for "All projects"

  const handleSelect = useCallback(() => {
    if (projectCursor === totalItems - 1) {
      // Last item = "All projects"
      setSelectedProject(null);
    } else {
      setSelectedProject(projects[projectCursor].path);
    }
    setScreen('kanban');
  }, [projectCursor, projects, totalItems, setSelectedProject, setScreen]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (key.upArrow || input === 'k') {
        moveProjectCursor(-1);
        return;
      }
      if (key.downArrow || input === 'j') {
        moveProjectCursor(1);
        return;
      }
      if (key.return) {
        handleSelect();
        return;
      }
    },
    [moveProjectCursor, handleSelect],
  );

  const totalTasks = tasks.length;

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      {isRawModeSupported && <KeyboardHandler onInput={handleInput} />}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={4}
        paddingY={2}
        minWidth={50}
      >
        {/* Header */}
        <Box marginBottom={1} justifyContent="center">
          <Text bold color="cyan">
            SELECT PROJECT
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>{'─'.repeat(38)}</Text>
        </Box>

        {/* Project list */}
        {projects.map((p, i) => {
          const isSelected = i === projectCursor;
          return (
            <Box key={p.path} marginBottom={0}>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? ' ▶ ' : '   '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                {p.name.padEnd(30)}
              </Text>
              <Text dimColor>{p.taskCount} tasks</Text>
            </Box>
          );
        })}

        {/* Separator */}
        <Box marginY={1}>
          <Text dimColor> {'─'.repeat(38)}</Text>
        </Box>

        {/* All projects option */}
        {(() => {
          const isSelected = projectCursor === totalItems - 1;
          return (
            <Box>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? ' ▶ ' : '   '}
              </Text>
              <Text
                bold={isSelected}
                color={isSelected ? 'cyan' : undefined}
                dimColor={!isSelected}
              >
                {'All projects'.padEnd(30)}
              </Text>
              <Text dimColor>{totalTasks} tasks</Text>
            </Box>
          );
        })()}

        {/* Footer */}
        <Box marginTop={2} justifyContent="center">
          <Text dimColor>↑/↓ navigate Enter select</Text>
        </Box>
      </Box>
    </Box>
  );
}
