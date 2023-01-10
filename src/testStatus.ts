import * as vscode from 'vscode'

export enum Status {
  passed,
  failed,
  errored,
  running,
  skipped
}

export class TestStatus {
  constructor(
    public readonly testItem: vscode.TestItem,
    public readonly status: Status,
    public readonly duration?: number,
    public readonly message?: vscode.TestMessage,
  ) {}
}