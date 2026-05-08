import { Box, Text } from 'ink';
import React, { useState, useEffect } from 'react';

// Compact 3-line box-drawing rendition of "ORALE!"
// Each letter is 3 chars wide, 1-char space between, gradient applied per row
const LOGO_LINES = [
  '╔═╗ ╦═╗ ╔═╗ ╔   ╔══ ╦',
  '║ ║ ╠╦╝ ╠═╣ ║   ╠═  ║',
  '╚═╝ ╩╚═ ╩ ╩ ╚══ ╚══ ·',
] as const;

// Spread across the same magenta→cyan→blue arc as the splash
const LINE_COLORS = ['magentaBright', 'cyanBright', 'blue'] as const;

const SUBTITLE = 'orchestrate AI agents across parallel git worktrees';

export function TitleBar() {
  const [shimmerRow, setShimmerRow] = useState(0);

  useEffect(() => {
    const isAnimationComplete = shimmerRow >= LOGO_LINES.length;
    if (isAnimationComplete) return;
    const t = setTimeout(() => setShimmerRow((r) => r + 1), 80);
    return () => clearTimeout(t);
  }, [shimmerRow]);

  const isAnimating = shimmerRow < LOGO_LINES.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderColor="cyan"
      paddingX={1}
    >
      <Box flexDirection="row" alignItems="center">
        <Box flexDirection="column">
          {LOGO_LINES.map((line, i) => {
            const isShimmer = isAnimating && shimmerRow === i;
            const isDimmed = isAnimating && shimmerRow !== i;
            return (
              <Text key={line} color={LINE_COLORS[i]} bold={isShimmer} dimColor={isDimmed}>
                {line}
              </Text>
            );
          })}
        </Box>
        <Box marginLeft={2}>
          <Text dimColor>• {SUBTITLE}</Text>
        </Box>
      </Box>
    </Box>
  );
}
