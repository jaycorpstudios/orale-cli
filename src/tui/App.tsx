import { Box, Text, render, useApp, useStdin } from 'ink';
import React, { useCallback } from 'react';
import { createDefaultRegistry } from '../adapters/registry.js';
import type { StorageAdapter } from '../adapters/storage/interface.js';
import type { TrackerAdapter } from '../adapters/tracker/interface.js';
import { loadConfig } from '../config/loader.js';
import { Header } from './components/Header.js';
import { KeyboardHandler } from './components/KeyboardHandler.js';
import { NotificationBar } from './components/Notification.js';
import { StatusBar } from './components/StatusBar.js';
import { TitleBar } from './components/TitleBar.js';
import { usePrPolling } from './hooks/usePrPolling.js';
import { useTaskPolling } from './hooks/useTaskPolling.js';
import { HelpScreen } from './screens/Help.js';
import { KanbanScreen } from './screens/Kanban.js';
import { ProjectPickerScreen } from './screens/ProjectPicker.js';
import { SplashScreen } from './screens/Splash.js';
import { TaskDetailScreen } from './screens/TaskDetail.js';
import { detectProject, getProjects, useOraleStore } from './store.js';

interface AppProps {
  storage: StorageAdapter;
  tracker: TrackerAdapter;
}

function OraleApp({ storage, tracker }: AppProps) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  const screen = useOraleStore((s) => s.screen);
  const tasks = useOraleStore((s) => s.tasks);
  const config = useOraleStore((s) => s.config);
  const projectRoot = useOraleStore((s) => s.projectRoot);
  const filterMode = useOraleStore((s) => s.filterMode);
  const filterText = useOraleStore((s) => s.filterText);
  const activeRuns = useOraleStore((s) => s.activeRuns);
  const notifications = useOraleStore((s) => s.notifications);
  const selectedProject = useOraleStore((s) => s.selectedProject);
  const dismissNotification = useOraleStore((s) => s.dismissNotification);
  const setScreen = useOraleStore((s) => s.setScreen);
  const setSelectedProject = useOraleStore((s) => s.setSelectedProject);

  // Start data polling
  useTaskPolling(storage, 4000);
  usePrPolling(storage, tracker, config?.tui.prPollMs ?? 2 * 60_000);

  // Called when the splash animation finishes
  const onSplashComplete = useCallback(() => {
    const currentTasks = useOraleStore.getState().tasks;
    const projects = getProjects(currentTasks);

    if (projects.length === 0) {
      // No tasks yet — go straight to kanban (empty state)
      setScreen('kanban');
      return;
    }

    // Try auto-detect from CWD
    const matched = detectProject(currentTasks);
    if (matched) {
      setSelectedProject(matched);
      setScreen('kanban');
    } else if (projects.length === 1) {
      // Only one project — auto-select it
      setSelectedProject(projects[0].path);
      setScreen('kanban');
    } else {
      // Multiple projects, no match → show picker
      setScreen('projectPicker');
    }
  }, [setScreen, setSelectedProject]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Global keybindings — only on non-splash screens */}
      {isRawModeSupported && screen !== 'splash' && (
        <KeyboardHandler
          onInput={(input, key) => {
            if (input === 'q' || (key.ctrl && input === 'c')) exit();
            if (input === 'x' && notifications.length > 0) {
              dismissNotification(notifications[notifications.length - 1].id);
            }
          }}
        />
      )}

      {/* Splash — fullscreen, no header/footer */}
      {screen === 'splash' ? (
        <SplashScreen onComplete={onSplashComplete} durationMs={1800} />
      ) : (
        <>
          <TitleBar />
          <Header
            projectRoot={projectRoot}
            storageAdapter={config?.storage.adapter ?? 'local-sqlite'}
            taskCount={tasks.length}
            activeRunCount={activeRuns.size}
            selectedProject={selectedProject}
          />

          <Box flexGrow={1} overflow="hidden">
            {screen === 'projectPicker' && <ProjectPickerScreen />}
            {screen === 'kanban' && <KanbanScreen storage={storage} />}
            {screen === 'detail' && <TaskDetailScreen storage={storage} />}
            {screen === 'help' && <HelpScreen />}
          </Box>

          {notifications.length > 0 && <NotificationBar notifications={notifications} />}

          <StatusBar screen={screen} filterMode={filterMode} filterText={filterText} />
        </>
      )}
    </Box>
  );
}

function ErrorApp({ message }: { message: string }) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  return (
    <Box flexDirection="column" padding={2} alignItems="flex-start">
      {isRawModeSupported && (
        <KeyboardHandler
          onInput={(input, key) => {
            if (input === 'q' || key.escape) exit();
          }}
        />
      )}
      <Text bold color="cyanBright">
        ⬡ orale
      </Text>
      <Box marginTop={1}>
        <Text color="red">✗ </Text>
        <Text>{message}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>Run </Text>
          <Text color="cyan">orale init</Text>
          <Text dimColor> to set up orale in this directory</Text>
        </Box>
        <Box>
          <Text dimColor>or </Text>
          <Text color="cyan">orale doctor</Text>
          <Text dimColor> to diagnose issues</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    </Box>
  );
}

export async function launchTui(): Promise<void> {
  let storage: StorageAdapter | null = null;
  let tracker: TrackerAdapter | null = null;
  let initError: string | null = null;

  try {
    const { config, projectRoot } = await loadConfig();
    const registry = await createDefaultRegistry(config);

    storage = registry.resolveStorage(config);
    tracker = registry.resolveTracker(config);

    await storage.init();

    useOraleStore.getState().setConfig(config, projectRoot);
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
  }

  if (initError || !storage || !tracker) {
    const { waitUntilExit } = render(
      <ErrorApp message={initError ?? 'Failed to initialize adapters'} />,
    );
    await waitUntilExit();
    return;
  }

  const { waitUntilExit } = render(<OraleApp storage={storage} tracker={tracker} />, {
    exitOnCtrlC: false,
  });

  await waitUntilExit();
  await storage.close?.();
}
