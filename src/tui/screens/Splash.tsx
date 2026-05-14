import { Box, Text } from 'ink';
import React, { useState, useEffect } from 'react';
import { VERSION } from '../../version.js';

// "ÓRALE!" in Unicode block characters — each row is one element of the array
const LOGO_LINES = [
  '   ██████╗ ██████╗  █████╗ ██╗     ███████╗  ██╗',
  '  ██╔═══██╗██╔══██╗██╔══██╗██║     ██╔════╝  ██║',
  '  ██║   ██║██████╔╝███████║██║     █████╗  ██║',
  '  ██║   ██║██╔══██╗██╔══██║██║     ██╔══╝  ╚═╝',
  '  ╚██████╔╝██║  ██║██║  ██║███████╗███████╗  ██╗',
  '   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝  ╚═╝',
];

const GRADIENT_COLORS = [
  'magentaBright',
  'blueBright',
  'cyanBright',
  'cyan',
  'blue',
  'magenta',
] as const;

const SUBTITLE = 'orchestrate AI agents across parallel git worktrees';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface Props {
  onComplete: () => void;
  durationMs?: number;
}

export function SplashScreen({ onComplete, durationMs = 2800 }: Props) {
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDone(true);
      onComplete();
    }, durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs, onComplete]);

  // Phase 1 (ticks 0–5): reveal lines one by one
  // Phase 2 (ticks 6+): shimmer — shift bright row downward
  const revealedLines = Math.min(tick, LOGO_LINES.length);
  const shimmerRow =
    tick >= LOGO_LINES.length ? (tick - LOGO_LINES.length) % LOGO_LINES.length : -1;

  const spinnerFrame = SPINNER[tick % SPINNER.length];

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      paddingY={2}
    >
      {/* Logo */}
      <Box flexDirection="column" alignItems="flex-start" marginBottom={1}>
        {LOGO_LINES.map((line, i) => {
          if (i >= revealedLines) return <Text key={line}>{' '.repeat(line.length)}</Text>;
          const isShimmer = shimmerRow === i;
          const baseColor = GRADIENT_COLORS[i % GRADIENT_COLORS.length];
          return (
            <Text
              key={line}
              color={baseColor}
              bold={isShimmer}
              dimColor={!isShimmer && shimmerRow >= 0}
            >
              {line}
            </Text>
          );
        })}
      </Box>

      {/* Brand name + subtitle — fade in after logo reveals */}
      {revealedLines >= LOGO_LINES.length ? (
        <>
          <Text bold color="cyanBright">
            Órale!
          </Text>
          <Text dimColor>{SUBTITLE}</Text>
        </>
      ) : (
        <Text dimColor> </Text>
      )}

      {/* Version */}
      <Box marginTop={1}>
        <Text dimColor>{`v${VERSION}`}</Text>
      </Box>

      {/* Loading indicator */}
      <Box marginTop={2}>
        <Text color="cyan">{spinnerFrame} </Text>
        <Text dimColor>Initializing…</Text>
      </Box>
    </Box>
  );
}
