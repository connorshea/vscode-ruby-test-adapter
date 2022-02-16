import * as vscode from 'vscode';
import { TestLoader } from "./testLoader";
import { getTestFramework } from './frameworkDetector';
import { IVSCodeExtLogger } from "@vscode-logging/logger";
import { RspecTestLoader } from './rspec/rspecTestLoader';
import { MinitestTestLoader } from './minitest/minitestTestLoader';
import { RspecTests } from './rspec/rspecTests';
import { MinitestTests } from './minitest/minitestTests';

export class TestLoaderFactory implements vscode.Disposable {
  private _instance: TestLoader | null = null;
  protected disposables: { dispose(): void }[] = [];

  constructor(
    protected readonly _log: IVSCodeExtLogger,
    protected readonly _context: vscode.ExtensionContext,
    protected readonly _workspace: vscode.WorkspaceFolder,
    protected readonly _controller: vscode.TestController
  ) {
    this.disposables.push(this.configWatcher());
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  public getLoader(): TestLoader {
    if (this._instance) {
      return this._instance;
    }

    let framework = getTestFramework(this._log);
    switch(framework) {
      case "rspec":
        return new RspecTestLoader(
          this._log,
          this._context,
          this._workspace,
          this._controller,
          new RspecTests(
            this._context,
            this._log,
            this._workspace,
            this._controller
          )
        );
      case "minitest":
        return new MinitestTestLoader(
          this._log,
          this._context,
          this._workspace,
          this._controller,
          new MinitestTests(
            this._context,
            this._log,
            this._workspace,
            this._controller
          ));
      default:
        throw `Unknown framework ${framework}`
    }
  }

  private configWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this._log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        this._instance?.dispose()
        this._instance = null
      }
    })
  }
}