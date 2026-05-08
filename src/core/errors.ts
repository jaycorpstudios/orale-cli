export class OraleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'OraleError';
  }
}

export class AdapterError extends OraleError {
  constructor(
    public readonly adapterName: string,
    message: string,
  ) {
    super(`[${adapterName}] ${message}`, 'ADAPTER_ERROR');
    this.name = 'AdapterError';
  }
}

export class ConfigError extends OraleError {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(filePath ? `${message} (in ${filePath})` : message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class TaskNotFoundError extends OraleError {
  constructor(public readonly taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
  }
}

export class DependencyCycleError extends OraleError {
  constructor(public readonly cycle: string) {
    super(`Circular dependency detected: ${cycle}`, 'DEPENDENCY_CYCLE');
    this.name = 'DependencyCycleError';
  }
}

export class AgentTimeoutError extends OraleError {
  constructor(
    public readonly taskId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Agent timed out after ${timeoutMs / 1000}s for task ${taskId}`, 'AGENT_TIMEOUT');
    this.name = 'AgentTimeoutError';
  }
}

export class PreflightError extends OraleError {
  constructor(
    public readonly adapterName: string,
    message: string,
  ) {
    super(`Preflight failed for ${adapterName}: ${message}`, 'PREFLIGHT_ERROR');
    this.name = 'PreflightError';
  }
}
