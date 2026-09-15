export interface LogContext {
  [key: string]: boolean | number | string | null | undefined;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function write(
  level: 'error' | 'info',
  service: string,
  message: string,
  context: LogContext,
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...context,
  });

  if (level === 'error') {
    console.error(entry);
  } else {
    console.info(entry);
  }
}

export function createLogger(service: string): Logger {
  return {
    info: (message, context = {}) => write('info', service, message, context),
    error: (message, context = {}) => write('error', service, message, context),
  };
}
