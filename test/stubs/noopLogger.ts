import { IVSCodeExtLogger, IChildLogger } from "@vscode-logging/types";

export function noop() {}

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
