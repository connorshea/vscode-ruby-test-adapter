import * as vscode from 'vscode';
import { getTestFramework } from './frameworkDetector';
import { IVSCodeExtLogger } from "@vscode-logging/logger";
import { RspecTestLoader } from './rspec/rspecTestLoader';
import { MinitestTestLoader } from './minitest/minitestTestLoader';
import { RspecTestRunner } from './rspec/rspecTestRunner';
import { MinitestTestRunner } from './minitest/minitestTestRunner';

export class TestFactory implements vscode.Disposable {
  private loader: RspecTestLoader | MinitestTestLoader | null = null;
  private runner: RspecTestRunner | MinitestTestRunner | null = null;
  protected disposables: { dispose(): void }[] = [];
  protected framework: string;

  constructor(
    protected readonly log: IVSCodeExtLogger,
    protected readonly context: vscode.ExtensionContext,
    protected readonly workspace: vscode.WorkspaceFolder | null,
    protected readonly controller: vscode.TestController
  ) {
    this.disposables.push(this.configWatcher());
    this.framework = getTestFramework(this.log);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  public getRunner(): RspecTestRunner | MinitestTestRunner {
    if (!this.runner) {
      this.runner = this.framework == "rspec"
        ? new RspecTestRunner(
            this.context,
            this.log,
            this.workspace,
            this.controller
          )
        : new MinitestTestRunner(
            this.context,
            this.log,
            this.workspace,
            this.controller
          )
      this.disposables.push(this.runner);
    }
    return this.runner
  }

  public getLoader(): RspecTestLoader | MinitestTestLoader {
    if (!this.loader) {
      this.loader = this.framework == "rspec"
      ? new RspecTestLoader(
          this.log,
          this.context,
          this.workspace,
          this.controller,
          this.getRunner()
        )
      : new MinitestTestLoader(
          this.log,
          this.context,
          this.workspace,
          this.controller,
          this.getRunner());
      this.disposables.push(this.loader)
    }
    return this.loader
  }

  private configWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        let newFramework = getTestFramework(this.log);
        if (newFramework !== this.framework) {
          // Config has changed to a different framework - recreate test loader and runner
          if (this.loader) {
            this.disposeInstance(this.loader)
            this.loader = null
          }
          if (this.runner) {
            this.disposeInstance(this.runner)
            this.runner = null
          }
        }
      }
    })
  }

  private disposeInstance(instance: vscode.Disposable) {
    let index = this.disposables.indexOf(instance);
    if (index !== -1) {
      this.disposables.splice(index)
    }
    else {
      this.log.debug("Factory instance not null but missing from disposables when configuration changed");
    }
    instance.dispose()
  }
}