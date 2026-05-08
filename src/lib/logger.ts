const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';

const isTTY = process.stdout.isTTY;

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function fmt(level: string, color: string, msg: string): string {
  if (!isTTY) return `${timestamp()} ${level} ${msg}`;
  return `${DIM}${timestamp()}${RESET} ${color}${BOLD}${level}${RESET} ${msg}`;
}

export const log = {
  info: (msg: string) => console.log(fmt('INFO ', CYAN, msg)),
  success: (msg: string) => console.log(fmt('OK   ', GREEN, msg)),
  warn: (msg: string) => console.warn(fmt('WARN ', YELLOW, msg)),
  error: (msg: string) => console.error(fmt('ERROR', RED, msg)),
  debug: (msg: string) => console.log(fmt('DEBUG', BLUE, msg)),
  task: (id: string, msg: string) =>
    console.log(fmt('TASK ', CYAN, `${isTTY ? BOLD : ''}[${id}]${isTTY ? RESET : ''} ${msg}`)),
};

export type Logger = typeof log;
