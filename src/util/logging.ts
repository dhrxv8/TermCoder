// ANSI color codes for terminal styling
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  
  // Standard colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
} as const;

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS format
}

function colorize(text: string, color: keyof typeof colors): string {
  // Don't colorize if NO_COLOR is set or if output is not a TTY
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

export const log = {
  // Claude Code style info messages
  info: (...args: any[]) => {
    const timestamp = colorize(formatTimestamp(), 'dim');
    const prefix = colorize('info', 'cyan');
    console.log(`${timestamp} ${prefix} ${args.join(' ')}`);
  },
  
  // Success/completion messages  
  success: (...args: any[]) => {
    const timestamp = colorize(formatTimestamp(), 'dim');
    const prefix = colorize('✓', 'green');
    console.log(`${timestamp} ${prefix} ${args.join(' ')}`);
  },
  
  // Warning messages
  warn: (...args: any[]) => {
    const timestamp = colorize(formatTimestamp(), 'dim');
    const prefix = colorize('warn', 'yellow');
    console.warn(`${timestamp} ${prefix} ${args.join(' ')}`);
  },
  
  // Error messages
  error: (...args: any[]) => {
    const timestamp = colorize(formatTimestamp(), 'dim');
    const prefix = colorize('error', 'red');
    console.error(`${timestamp} ${prefix} ${args.join(' ')}`);
  },
  
  // Step/action messages
  step: (step: string, ...args: any[]) => {
    const timestamp = colorize(formatTimestamp(), 'dim');
    const prefix = colorize('→', 'blue');
    const stepText = colorize(step, 'bright');
    console.log(`${timestamp} ${prefix} ${stepText}${args.length > 0 ? ': ' + args.join(' ') : ''}`);
  },
  
  // Raw output without formatting
  raw: (...args: any[]) => {
    console.log(...args);
  },
  
  // Utility functions for colors
  colors: {
    green: (text: string) => colorize(text, 'green'),
    red: (text: string) => colorize(text, 'red'),
    yellow: (text: string) => colorize(text, 'yellow'),
    blue: (text: string) => colorize(text, 'blue'),
    cyan: (text: string) => colorize(text, 'cyan'),
    magenta: (text: string) => colorize(text, 'magenta'),
    dim: (text: string) => colorize(text, 'dim'),
    bright: (text: string) => colorize(text, 'bright'),
  }
};