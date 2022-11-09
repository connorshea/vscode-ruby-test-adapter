import * as vscode from 'vscode';
import { IVSCodeExtLogger } from "@vscode-logging/logger";
import { RspecTestRunner } from './rspec/rspecTestRunner';
import { MinitestTestRunner } from './minitest/minitestTestRunner';
import { Config } from './config';
import { TestLoader } from './testLoader';
import { RspecConfig } from './rspec/rspecConfig';
import { MinitestConfig } from './minitest/minitestConfig';
import { TestSuite } from './testSuite';

export class TestFactory implements vscode.Disposable {
  private loader: TestLoader | null = null;
  private runner: RspecTestRunner | MinitestTestRunner | null = null;
  protected disposables: { dispose(): void }[] = [];
  protected framework: string;
  private testSuite: TestSuite

  constructor(
    private readonly log: IVSCodeExtLogger,
    private readonly workspace: vscode.WorkspaceFolder | undefined,
    private readonly controller: vscode.TestController,
    private config: Config
  ) {
    this.disposables.push(this.configWatcher());
    this.framework = Config.getTestFramework(this.log);
    this.testSuite = new TestSuite(this.log, this.controller, this.config)
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
            this.log,
            this.workspace,
            this.controller,
            this.config,
            this.testSuite
          )
        : new MinitestTestRunner(
            this.log,
            this.workspace,
            this.controller,
            this.config,
            this.testSuite
          )
      this.disposables.push(this.runner);
    }
    return this.runner
  }

  public getLoader(): TestLoader {
    if (!this.loader) {
      this.loader = new TestLoader(
        this.log,
        this.controller,
        this.getRunner(),
        this.config,
        this.testSuite
      )
      this.disposables.push(this.loader)
    }
    return this.loader
  }

  private configWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        let newFramework = Config.getTestFramework(this.log);
        if (newFramework !== this.framework) {
          // Config has changed to a different framework - recreate test loader and runner
          this.config = newFramework == "rspec"
            ? new RspecConfig(this.config.rubyScriptPath)
            : new MinitestConfig(this.config.rubyScriptPath)
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
