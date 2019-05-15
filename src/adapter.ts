import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { RspecTests } from './rspecTests';

export class RubyAdapter implements TestAdapter {
  private disposables: { dispose(): void }[] = [];

  private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private rspecTestsInstance: RspecTests | undefined;

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
  }

  async load(): Promise<void> {
    this.log.info('Loading Ruby tests');
    this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });
    this.rspecTestsInstance = new RspecTests(this.context, this.testStatesEmitter);
    const loadedTests = await this.rspecTestsInstance.loadRspecTests();
    this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
  }

  async run(tests: string[]): Promise<void> {
    this.log.info(`Running Ruby tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
    this.rspecTestsInstance = new RspecTests(this.context, this.testStatesEmitter);
    await this.rspecTestsInstance.runRspecTests(tests);
    this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
  }

  cancel(): void {
    this.rspecTestsInstance!.killChild();
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
