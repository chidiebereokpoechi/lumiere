type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current = ((process.env.LOG_LEVEL ?? 'info') as Level);

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (ORDER[level] < (ORDER[current] ?? 20)) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
};
