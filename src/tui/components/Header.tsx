import { Box, Text } from 'ink';
import React from 'react';

interface Props {
  projectRoot: string | null;
  storageAdapter: string;
  taskCount: number;
  activeRunCount: number;
  selectedProject: string | null;
}

export function Header({
  projectRoot: _projectRoot,
  storageAdapter,
  taskCount,
  activeRunCount,
  selectedProject,
}: Props) {
  const projectName = selectedProject
    ? (selectedProject.split('/').pop() ?? selectedProject)
    : null;

  return (
    <Box
      justifyContent="space-between"
      paddingX={1}
      borderStyle="single"
      borderColor="cyan"
      marginBottom={0}
    >
      {/* Left: brand */}
      <Box>
        <Text bold color="cyanBright">
          ⬡ orale
        </Text>
        {projectName ? (
          <>
            <Text dimColor> / </Text>
            <Text color="white" bold>
              {projectName}
            </Text>
          </>
        ) : (
          <Text dimColor> — all projects</Text>
        )}
      </Box>

      {/* Right: status */}
      <Box>
        {activeRunCount > 0 ? (
          <Box marginRight={2}>
            <Text color="yellow">⚙ {activeRunCount} running</Text>
          </Box>
        ) : null}
        <Text dimColor>{taskCount} tasks</Text>
        <Text dimColor> </Text>
        <Text dimColor color="blue">
          {storageAdapter}
        </Text>
      </Box>
    </Box>
  );
}
