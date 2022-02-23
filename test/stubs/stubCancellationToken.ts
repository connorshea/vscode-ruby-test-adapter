import * as vscode from 'vscode'

export class StubCancellationToken implements vscode.CancellationToken {
  isCancellationRequested: boolean;

  private readonly eventEmitter = new vscode.EventEmitter<any>();
  private listeners: ((e: any) => any)[] = []

  constructor() {
    this.isCancellationRequested = false
  }

  public dispose() {
    this.listeners = []
  }

  set onCancellationRequested(listener: vscode.Event<any>) {
    this.eventEmitter.event(listener)
  }

  public cancel() {
    this.isCancellationRequested = true
    this.listeners.forEach(listener => listener(null));
  }
}