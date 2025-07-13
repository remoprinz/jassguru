/**
 * Debug-Logger für konsistente Logging-Strategie
 * Verhindert Production-Logs und bietet strukturierte Debug-Ausgaben
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LoggerConfig {
  prefix: string;
  enabledInProduction: boolean;
}

class Logger {
  private prefix: string;
  private enabledInProduction: boolean;
  private isDevelopment: boolean;

  constructor(config: LoggerConfig) {
    this.prefix = config.prefix;
    this.enabledInProduction = config.enabledInProduction;
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) return true;
    return this.enabledInProduction && level === 'error';
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  // Spezielle Auth-Logs die immer wichtig sind
  authEvent(message: string, ...args: any[]): void {
    if (this.isDevelopment || this.enabledInProduction) {
      console.info(this.formatMessage('info', `🔐 AUTH: ${message}`), ...args);
    }
  }

  // Navigation-Logs für Debugging
  navigation(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.info(this.formatMessage('info', `🧭 NAV: ${message}`), ...args);
    }
  }
}

// Vordefinierte Logger für verschiedene Komponenten
export const authLogger = new Logger({
  prefix: 'Auth',
  enabledInProduction: false
});

export const navigationLogger = new Logger({
  prefix: 'Navigation',
  enabledInProduction: false
});

export const welcomeLogger = new Logger({
  prefix: 'WelcomeScreen',
  enabledInProduction: false
});

export const appLogger = new Logger({
  prefix: 'App',
  enabledInProduction: true // App-Level-Fehler sind wichtig
});

// Utility-Funktion für kritische Fehler
export function logCriticalError(component: string, error: any, context?: string): void {
  const criticalLogger = new Logger({
    prefix: `CRITICAL-${component}`,
    enabledInProduction: true
  });
  
  criticalLogger.error(
    `${context ? `[${context}] ` : ''}Critical error occurred`,
    error
  );
} 