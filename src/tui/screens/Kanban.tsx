import { Box, type Key, Text, useStdin } from 'ink';
import React, { useCallback, useEffect } from 'react';
import type { StorageAdapter } from '../../adapters/storage/interface.js';
import type { TaskStatus } from '../../core/task.js';
import { Column } from '../components/Column.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { KeyboardHandler } from '../components/KeyboardHandler.js';
import { useRunTask } from '../hooks/useRunTask.js';
import { COLUMN_ORDER, getActiveTask, getColumnTasks, useOraleStore } from '../store.js';

interface Props {
  storage: StorageAdapter | null;
}

export function KanbanScreen({ storage }: Props) {
  const tasks = useOraleStore((s) => s.tasks);
  const activeColumn = useOraleStore((s) => s.activeColumn);
  const activeRowIndex = useOraleStore((s) => s.activeRowIndex);
  const filterText = useOraleStore((s) => s.filterText);
  const filterMode = useOraleStore((s) => s.filterMode);
  const activeRuns = useOraleStore((s) => s.activeRuns);
  const selectedProject = useOraleStore((s) => s.selectedProject);
  const { isRawModeSupported } = useStdin();

  const selectColumn = useOraleStore((s) => s.selectColumn);
  const moveRow = useOraleStore((s) => s.moveRow);
  const openDetail = useOraleStore((s) => s.openDetail);
  const setScreen = useOraleStore((s) => s.setScreen);
  const setFilterMode = useOraleStore((s) => s.setFilterMode);
  const appendFilter = useOraleStore((s) => s.appendFilter);
  const clearFilter = useOraleStore((s) => s.clearFilter);
  const addNotification = useOraleStore((s) => s.addNotification);
  const setSelectedProject = useOraleStore((s) => s.setSelectedProject);
  const confirmPending = useOraleStore((s) => s.confirmPending);
  const setConfirm = useOraleStore((s) => s.setConfirm);
  const clearConfirm = useOraleStore((s) => s.clearConfirm);

  const { runTask, runAllTasks } = useRunTask();

  const tickRuns = useOraleStore((s) => s.tickRuns);
  useEffect(() => {
    const interval = setInterval(tickRuns, 100);
    return () => clearInterval(interval);
  }, [tickRuns]);

  const moveColumn = useCallback(
    (delta: number) => {
      const colIdx = COLUMN_ORDER.indexOf(activeColumn);
      const next = Math.max(0, Math.min(COLUMN_ORDER.length - 1, colIdx + delta));
      selectColumn(COLUMN_ORDER[next]);
    },
    [activeColumn, selectColumn],
  );

  const moveStatus = useCallback(
    async (newStatus: TaskStatus) => {
      const task = getActiveTask(useOraleStore.getState());
      if (!task || !storage) return;
      try {
        await storage.update(task.id, { status: newStatus });
        const hint =
          newStatus === 'todo' || newStatus === 'in-progress' ? '  · press SPACE to run' : '';
        addNotification(`[${task.id}] → ${newStatus}${hint}`, 'info', task.id);
      } catch (err) {
        addNotification(`Failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [storage, addNotification],
  );

  const handleInput = useCallback(
    (input: string, key: Key) => {
      // ── Confirm dialog intercept ──────────────────────────────────────────
      if (confirmPending) {
        if (input === 'y' || input === 'Y') {
          confirmPending.onConfirm();
          clearConfirm();
          return;
        }
        if (input === 'n' || input === 'N' || key.escape) {
          clearConfirm();
          return;
        }
        return; // Block all other input while confirming
      }

      if (filterMode) {
        if (key.escape) {
          clearFilter();
          return;
        }
        if (key.return) {
          setFilterMode(false);
          return;
        }
        if (key.backspace || key.delete) {
          const cur = useOraleStore.getState().filterText;
          if (cur.length > 0)
            useOraleStore.setState({ filterText: cur.slice(0, -1), activeRowIndex: 0 });
          return;
        }
        if (input && !key.ctrl && !key.meta && input.length === 1) appendFilter(input);
        return;
      }

      // ── Navigation — arrows are primary, vim keys secondary ──
      if (key.downArrow || input === 'j') {
        moveRow(1);
        return;
      }
      if (key.upArrow || input === 'k') {
        moveRow(-1);
        return;
      }
      if (key.leftArrow || input === 'h') {
        moveColumn(-1);
        return;
      }
      if (key.rightArrow || input === 'l') {
        moveColumn(1);
        return;
      }
      if (input === 'g') {
        useOraleStore.setState({ activeRowIndex: 0 });
        return;
      }
      if (input === 'G') {
        const s = useOraleStore.getState();
        const colTasks = getColumnTasks(s.tasks, s.activeColumn, s.filterText, s.selectedProject);
        useOraleStore.setState({ activeRowIndex: Math.max(0, colTasks.length - 1) });
        return;
      }

      // ── Actions ──
      if (key.return) {
        const task = getActiveTask(useOraleStore.getState());
        if (task) openDetail(task.id);
        return;
      }
      if (input === ' ') {
        const task = getActiveTask(useOraleStore.getState());
        if (task) {
          setConfirm({ type: 'run', task, onConfirm: () => void runTask(task) });
        }
        return;
      }
      if (input === 'A') {
        const s = useOraleStore.getState();
        const todoTasks = getColumnTasks(s.tasks, 'todo', s.filterText, s.selectedProject);
        if (todoTasks.length === 0) {
          addNotification('No eligible tasks to run', 'warn');
          return;
        }
        setConfirm({
          type: 'runAll',
          count: todoTasks.length,
          onConfirm: () => void runAllTasks(todoTasks),
        });
        return;
      }
      if (input === 'm') {
        const task = getActiveTask(useOraleStore.getState());
        if (!task) return;
        const idx = COLUMN_ORDER.indexOf(task.status as TaskStatus);
        void moveStatus(COLUMN_ORDER[(idx + 1) % COLUMN_ORDER.length]);
        return;
      }
      if (input === 'p') {
        // Go back to project picker
        setScreen('projectPicker');
        return;
      }
      if (input === '/') {
        setFilterMode(true);
        return;
      }
      if (key.escape) {
        clearFilter();
        return;
      }
      if (input === '?') {
        setScreen('help');
        return;
      }
    },
    [
      confirmPending,
      clearConfirm,
      setConfirm,
      filterMode,
      clearFilter,
      setFilterMode,
      appendFilter,
      moveRow,
      moveColumn,
      openDetail,
      runTask,
      runAllTasks,
      moveStatus,
      setScreen,
      addNotification,
    ],
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {isRawModeSupported && <KeyboardHandler onInput={handleInput} />}

      {/* Confirm dialog */}
      {confirmPending && (
        <ConfirmDialog
          type={confirmPending.type}
          task={confirmPending.task}
          count={confirmPending.count}
        />
      )}

      {/* Project context strip */}
      {selectedProject ? (
        <Box paddingX={1} marginBottom={0}>
          <Text dimColor>Project: </Text>
          <Text color="blue" bold>
            {selectedProject.split('/').slice(-2).join('/')}
          </Text>
          <Text dimColor> [p] switch project</Text>
          {filterText ? (
            <>
              <Text dimColor> filter: </Text>
              <Text color="yellow">{filterText}</Text>
            </>
          ) : null}
        </Box>
      ) : filterText ? (
        <Box paddingX={1} marginBottom={0}>
          <Text dimColor>Filter: </Text>
          <Text color="yellow">{filterText}</Text>
          <Text dimColor> (esc to clear)</Text>
        </Box>
      ) : null}

      {/* Columns */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {COLUMN_ORDER.map((status) => {
          const colTasks = getColumnTasks(tasks, status, filterText, selectedProject);
          return (
            <Column
              key={status}
              status={status}
              tasks={colTasks}
              isActive={activeColumn === status}
              activeRowIndex={activeRowIndex}
              activeRuns={activeRuns}
            />
          );
        })}
      </Box>
    </Box>
  );
}
