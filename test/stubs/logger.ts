import { LogLevel } from "@vscode-logging/logger";
import { IVSCodeExtLogger, IChildLogger } from "@vscode-logging/types";

function createChildLogger(parent: IVSCodeExtLogger, label: string): IChildLogger {
  let prependLabel = (l:string, m:string):string => `${l}: ${m}`
  return {
    ...parent,
    debug: (msg: string, ...args: any[]) => { parent.debug(prependLabel(label, msg), ...args) },
    error: (msg: string, ...args: any[]) => { parent.error(prependLabel(label, msg), ...args) },
    fatal: (msg: string, ...args: any[]) => { parent.fatal(prependLabel(label, msg), ...args) },
    info: (msg: string, ...args: any[]) => { parent.info(prependLabel(label, msg), ...args) },
    trace: (msg: string, ...args: any[]) => { parent.trace(prependLabel(label, msg), ...args) },
    warn: (msg: string, ...args: any[]) => { parent.warn(prependLabel(label, msg), ...args) }
  }
}

function noop() {}

/**
 * Noop logger for use in testing where logs are usually unnecessary
 */
export const NOOP_LOGGER: IVSCodeExtLogger = {
  changeLevel: noop,
  changeSourceLocationTracking: noop,
  debug: noop,
  error: noop,
  fatal: noop,
  getChildLogger(opts: { label: string }): IChildLogger {
    return this;
  },
  info: noop,
  trace: noop,
  warn: noop
};
Object.freeze(NOOP_LOGGER);

function stdout_logger(level: LogLevel = "info"): IVSCodeExtLogger {
  const levels: { [key: string]: number } = {
    "fatal": 0,
    "error": 1,
    "warn": 2,
    "info": 3,
    "debug": 4,
    "trace": 5,
  }
  const divider = '----------'
  let maxLevel = levels[level]
  function writeStdOutLogMsg(level: LogLevel, msg: string, ...args: any[]): void {
    if (levels[level] <= maxLevel) {
      let message = `[${level}] ${msg}${args.length > 0 ? ':' : ''}`
      args.forEach((arg) => {
        if (arg instanceof Error) {
          message = `${message}\n  ${arg.stack ? arg.stack : arg.name + ': ' + arg.message}`
        } else {
          message = `${message}\n  ${JSON.stringify(arg)}`
        }
      })
      switch(level) {
        case "fatal":
        case "error":
          console.error(message)
          console.error(divider)
          break;
        case "warn":
          console.warn(message)
          console.warn(divider)
          break;
        case "info":
          console.info(message)
          console.info(divider)
          break;
        case "debug":
        case "trace":
          console.debug(message)
          console.debug(divider)
          break;
      }
    }
  }
  let logger: IVSCodeExtLogger = {
    changeLevel: (level: LogLevel) => { maxLevel = levels[level] },
    changeSourceLocationTracking: noop,
    debug: (msg: string, ...args: any[]) => { writeStdOutLogMsg("debug", msg, ...args) },
    error: (msg: string, ...args: any[]) => { writeStdOutLogMsg("error", msg, ...args) },
    fatal: (msg: string, ...args: any[]) => { writeStdOutLogMsg("fatal", msg, ...args) },
    getChildLogger(opts: { label: string }): IChildLogger {
      return createChildLogger(this, opts.label);
    },
    info: (msg: string, ...args: any[]) => { writeStdOutLogMsg("info", msg, ...args) },
    trace: (msg: string, ...args: any[]) => { writeStdOutLogMsg("trace", msg, ...args) },
    warn: (msg: string, ...args: any[]) => { writeStdOutLogMsg("warn", msg, ...args) }
  }
  return logger
}

/**
 * Get a logger
 *
 * @param level One of "off", "fatal", "error", "warn", "info", "debug", "trace"
 * @returns a noop logger if level is "off", else a logger that logs to stdout at the specified level and below
 *    (e.g. logger("warn") would return a logger that logs only messages logged at "fatal", "error", and "warn" levels)
 */
export function logger(level: LogLevel = "info"): IVSCodeExtLogger {
  if (level == "off") {
    return NOOP_LOGGER
  } else {
    return stdout_logger(level)
  }
}
