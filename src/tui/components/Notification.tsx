import { Box, Text } from 'ink';
import React from 'react';
import type { Notification } from '../store.js';

const KIND_COLOR = {
  info: 'cyan',
  success: 'green',
  warn: 'yellow',
  error: 'red',
} as const;

const KIND_ICON = {
  info: 'ℹ',
  success: '✓',
  warn: '⚠',
  error: '✗',
} as const;

interface Props {
  notifications: Notification[];
}

export function NotificationBar({ notifications }: Props) {
  if (notifications.length === 0) return null;

  const latest = notifications[notifications.length - 1];

  return (
    <Box borderStyle="single" borderColor={KIND_COLOR[latest.kind]} paddingX={1} marginTop={0}>
      <Text color={KIND_COLOR[latest.kind]}>{KIND_ICON[latest.kind]}</Text>
      <Text> {latest.message}</Text>
      {notifications.length > 1 ? <Text dimColor> (+{notifications.length - 1} more)</Text> : null}
    </Box>
  );
}
