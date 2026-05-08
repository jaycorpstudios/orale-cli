import { type Key, useInput } from 'ink';
import React from 'react';

interface Props {
  onInput: (input: string, key: Key) => void;
  isActive?: boolean;
}

/**
 * Renders nothing but captures keyboard input via useInput.
 * Must only be rendered when raw mode is supported (isRawModeSupported from useStdin).
 * Conditionally rendering this component avoids the raw mode error in non-TTY environments.
 */
export function KeyboardHandler({ onInput, isActive = true }: Props) {
  useInput(onInput, { isActive });
  return null;
}
