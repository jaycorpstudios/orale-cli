import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_NAME = 'orale';

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
}

export const globalPaths = {
  config: join(xdgConfigHome(), APP_NAME, 'config.json'),
  data: join(xdgDataHome(), APP_NAME),
  db: join(xdgDataHome(), APP_NAME, 'orale.db'),
  skillsRoot: join(homedir(), '.claude', 'skills', APP_NAME),
} as const;

export function projectPaths(projectRoot: string) {
  const oraleDir = join(projectRoot, '.orale');
  return {
    oraleDir,
    config: join(oraleDir, 'config.json'),
    localConfig: join(oraleDir, 'config.local.json'),
    db: join(oraleDir, 'tasks.db'),
    logsDir: join(oraleDir, 'logs'),
    installedSkillsDir: join(projectRoot, '.claude', 'skills', APP_NAME),
  } as const;
}
