import { Box, Text } from 'ink';
import React, { useMemo } from 'react';

interface Props {
  lines: string[];
  height?: number;
  title?: string;
  scrollOffset?: number;
  follow?: boolean;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape code stripping
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

// Very simple ANSI coloring — pass through color codes for common ones
function renderLine(line: string, i: number) {
  // Strip ANSI for safe Ink rendering (Ink handles its own color system)
  const clean = stripAnsi(line);
  const isError = clean.includes('ERROR') || clean.includes('✗') || clean.includes('Failed');
  const isSuccess = clean.includes('OK') || clean.includes('✓') || clean.includes('Done');
  const isPrUrl = clean.includes('PR_URL:') || clean.includes('https://github.com');

  return (
    <Text
      key={i}
      color={isError ? 'red' : isSuccess ? 'green' : isPrUrl ? 'cyan' : undefined}
      dimColor={!isError && !isSuccess && !isPrUrl}
    >
      {clean}
    </Text>
  );
}

export function LogPane({ lines, height = 20, title, scrollOffset = 0, follow = true }: Props) {
  const visible = useMemo(
    () => (follow ? lines.slice(-height) : lines.slice(scrollOffset, scrollOffset + height)),
    [lines, height, follow, scrollOffset],
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {title ? (
        <Box marginBottom={0}>
          <Text bold color="cyan">
            {title}
          </Text>
        </Box>
      ) : null}

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        flexGrow={1}
        paddingX={1}
        overflow="hidden"
      >
        {visible.length === 0 ? (
          <Text dimColor>No output yet…</Text>
        ) : (
          visible.map((line, i) => renderLine(line, i))
        )}
        {!follow && lines.length > height && (
          <Text dimColor>
            ↑↓ scroll · G end · {scrollOffset + 1}–{Math.min(scrollOffset + height, lines.length)}/
            {lines.length}
          </Text>
        )}
      </Box>
    </Box>
  );
}
