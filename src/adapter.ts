import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { Tests } from './tests';
import { RspecTests } from './rspecTests';
import { MinitestTests } from './minitestTests';

export class RubyAdapter implements TestAdapter {
  private disposables: { dispose(): void }[] = [];

  private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private testsInstance: Tests | undefined;

  get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
  get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
  get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

  constructor(
    public readonly workspace: vscode.WorkspaceFolder,
    private readonly log: Log,
    private readonly context: vscode.ExtensionContext
  ) {
    this.log.info('Initializing Ruby adapter');

    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.autorunEmitter);
    this.disposables.push(this.createWatcher());
  }

  async load(): Promise<void> {
    this.log.info('Loading Ruby tests...');
    this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });
    if (this.getTestFramework() === "rspec") {
      this.log.info('Loading RSpec tests...');
      this.testsInstance = new RspecTests(this.context, this.testStatesEmitter, this.log);
      const loadedTests = await this.testsInstance.loadTests();
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
    } else if (this.getTestFramework() === "minitest") {
      this.log.info('Loading Minitest tests...');
      this.testsInstance = new MinitestTests(this.context, this.testStatesEmitter, this.log);
      const loadedTests = await this.testsInstance.loadTests();
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
    } else {
      this.log.warn('No test framework selected. Configure the rubyTestExplorer.testingFramework setting if you want to use the Ruby Test Explorer.');
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });
    }
  }

  async run(tests: string[]): Promise<void> {
    this.log.info(`Running Ruby tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
    if (!this.testsInstance) {
      if (this.getTestFramework() === "rspec") {
        this.testsInstance = new RspecTests(this.context, this.testStatesEmitter, this.log);
      } else if (this.getTestFramework() === "minitest") {
        this.testsInstance = new MinitestTests(this.context, this.testStatesEmitter, this.log);
      }
    }
    if (this.testsInstance) {
      await this.testsInstance.runTests(tests);
    }
    this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
  }

  cancel(): void {
    if (this.testsInstance) {
      this.log.info('Killing currently-running tests.')
      this.testsInstance.killChild();
    } else {
      this.log.info('No tests running currently, no process to kill.')
    }
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private getTestFramework(): string {
    let testFramework: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testingFramework') as string);
    return testFramework || 'none';
  }

  private getTestDirectory(): string {
    let testFramework: string = this.getTestFramework();
    let testDirectory: string = '';
    if (testFramework === 'rspec') {
      testDirectory = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('specDirectory') as string) || './spec/';
    } else if (testFramework === 'minitest') {
      testDirectory = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string) || './test/';
    }

    return testDirectory;
  }

  private createWatcher(): vscode.Disposable {
    return vscode.workspace.onDidSaveTextDocument(document => {
      const filename = document.uri.fsPath;
      this.log.info(`${filename} was saved - checking if this effects ${this.workspace.uri.fsPath}`);
      if (filename.startsWith(this.workspace.uri.fsPath)) {
        // relativeFilename is in the format of, e.g. './app/javascript/src/components/library.vue'.
        let relativeFilename = filename.replace(`${this.workspace.uri.fsPath}`, '.');
        let testDirectory = this.getTestDirectory();

        // In the case that there's no configured test directory, we shouldn't try to reload the tests.
        if (testDirectory !== '' && relativeFilename.startsWith(testDirectory)) {
          this.log.info('A test file has been edited, reloading tests.');
          this.load();
        }

        this.log.info('Sending autorun event');
        this.autorunEmitter.fire();
      }
    })
  }
}
