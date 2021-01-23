import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import * as childProcess from 'child_process';
import { Tests } from './tests';
import { RspecTests } from './rspecTests';
import { MinitestTests } from './minitestTests';

export class RubyAdapter implements TestAdapter {
  private disposables: { dispose(): void }[] = [];

  private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private testsInstance: Tests | undefined;
  private currentTestFramework: string | undefined;

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
    this.disposables.push(this.configWatcher());
  }

  async load(): Promise<void> {
    this.log.info('Loading Ruby tests...');
    this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });
    if (this.getTestFramework() === "rspec") {
      this.log.info('Loading RSpec tests...');
      this.testsInstance = new RspecTests(this.context, this.testStatesEmitter, this.log, this.workspace);
      const loadedTests = await this.testsInstance.loadTests();
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
    } else if (this.getTestFramework() === "minitest") {
      this.log.info('Loading Minitest tests...');
      this.testsInstance = new MinitestTests(this.context, this.testStatesEmitter, this.log, this.workspace);
      const loadedTests = await this.testsInstance.loadTests();
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: loadedTests });
    } else {
      this.log.warn('No test framework detected. Configure the rubyTestExplorer.testFramework setting if you want to use the Ruby Test Explorer.');
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });
    }
  }

  async run(tests: string[], debuggerConfig?: vscode.DebugConfiguration): Promise<void> {
    this.log.info(`Running Ruby tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
    if (!this.testsInstance) {
      let testFramework = this.getTestFramework();
      if (testFramework === "rspec") {
        this.testsInstance = new RspecTests(this.context, this.testStatesEmitter, this.log, this.workspace);
      } else if (testFramework === "minitest") {
        this.testsInstance = new MinitestTests(this.context, this.testStatesEmitter, this.log, this.workspace);
      }
    }
    if (this.testsInstance) {
      await this.testsInstance.runTests(tests, debuggerConfig);
    }
  }

  async debug(testsToRun: string[]): Promise<void> {
    this.log.info(`Debugging test(s) ${JSON.stringify(testsToRun)} of ${this.workspace.uri.fsPath}`);

    const config = vscode.workspace.getConfiguration('rubyTestExplorer', null)
    const rubyConfig = vscode.workspace.getConfiguration('ruby', null)

    const debuggerConfig = {
      name: "Debug Ruby Tests",
      type: "Ruby",
      request: "attach",
      remoteHost: config.get('debuggerHost') || "127.0.0.1",
      remotePort: config.get('debuggerPort') || "1234",
      remoteWorkspaceRoot: "${workspaceRoot}",
      useBundler: rubyConfig.get("useBundler") || false
    }

    const testRunPromise = this.run(testsToRun, debuggerConfig);

    this.log.info('Starting the debug session');
    let debugSession: any;
    try {
      await this.testsInstance!.debugCommandStarted()
      debugSession = await this.startDebugging(debuggerConfig);
    } catch (err) {
      this.log.error('Failed starting the debug session - aborting', err);
      this.cancel();
      return;
    }

    const subscription = this.onDidTerminateDebugSession((session) => {
      if (debugSession != session) return;
      this.log.info('Debug session ended');
      this.cancel(); // terminate the test run
      subscription.dispose();
    });

    await testRunPromise;
  }

  cancel(): void {
    if (this.testsInstance) {
      this.log.info('Killing currently-running tests.');
      this.testsInstance.killChild();
    } else {
      this.log.info('No tests running currently, no process to kill.');
    }
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Get the configured test framework.
   */
  protected getTestFramework(): string {
    // Short-circuit the test framework check if we've already determined the current test framework.
    if (this.currentTestFramework !== undefined) {
      return this.currentTestFramework;
    }

    let testFramework: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testFramework') as string);
    // If the test framework is something other than auto, return the value.
    if (['rspec', 'minitest', 'none'].includes(testFramework)) {
      this.currentTestFramework = testFramework;
      return testFramework;
      // If the test framework is auto, we need to try to detect the test framework type.
    } else {
      let detectedTestFramework = this.detectTestFramework();
      this.currentTestFramework = detectedTestFramework;
      return detectedTestFramework;
    }
  }

  /**
   * Detect the current test framework using 'bundle list'.
   */
  protected detectTestFramework(): string {
    this.log.info(`Getting a list of Bundler dependencies with 'bundle list'.`);

    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace.uri.fsPath,
      maxBuffer: 8192 * 8192
    };

    try {
      // Run 'bundle list' and set the output to bundlerList.
      // Execute this syncronously to avoid the test explorer getting stuck loading.
      let err, stdout = childProcess.execSync('bundle list', execArgs);

      if (err) {
        this.log.error(`Error while listing Bundler dependencies: ${err}`);
        this.log.error(`Output: ${stdout}`);
        throw err;
      }

      let bundlerList = stdout.toString();

      // Search for rspec or minitest in the output of 'bundle list'.
      // The search function returns the index where the string is found, or -1 otherwise.
      if (bundlerList.search('rspec-core') >= 0) {
        this.log.info(`Detected RSpec test framework.`);
        return 'rspec';
      } else if (bundlerList.search('minitest') >= 0) {
        this.log.info(`Detected Minitest test framework.`);
        return 'minitest';
      } else {
        this.log.info(`Unable to automatically detect a test framework.`);
        return 'none';
      }
    } catch (error) {
      this.log.error(error);
      return 'none';
    }
  }

  protected async startDebugging(debuggerConfig: vscode.DebugConfiguration): Promise<vscode.DebugSession> {
    const debugSessionPromise = new Promise<vscode.DebugSession>((resolve, reject) => {

      let subscription: vscode.Disposable | undefined;
      subscription = vscode.debug.onDidStartDebugSession(debugSession => {
        if ((debugSession.name === debuggerConfig.name) && subscription) {
          resolve(debugSession);
          subscription.dispose();
          subscription = undefined;
        }
      });

      setTimeout(() => {
        if (subscription) {
          reject(new Error('Debug session failed to start within 5 seconds'));
          subscription.dispose();
          subscription = undefined;
        }
      }, 5000);
    });

    const started = await vscode.debug.startDebugging(this.workspace, debuggerConfig);
    if (started) {
      return await debugSessionPromise;
    } else {
      throw new Error('Debug session couldn\'t be started');
    }
  }

  protected onDidTerminateDebugSession(cb: (session: vscode.DebugSession) => any): vscode.Disposable {
    return vscode.debug.onDidTerminateDebugSession(cb);
  }

  /**
   * Get the test directory based on the configuration value if there's a configured test framework.
   */
  private getTestDirectory(): string {
    let testFramework = this.getTestFramework();
    let testDirectory = '';
    if (testFramework === 'rspec') {
      testDirectory = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecDirectory') as string) || './spec/';
    } else if (testFramework === 'minitest') {
      testDirectory = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string) || './test/';
    }

    return testDirectory;
  }

  /**
   * Create a file watcher that will reload the test tree when a relevant file is changed.
   */
  private createWatcher(): vscode.Disposable {
    return vscode.workspace.onDidSaveTextDocument(document => {
      // If there isn't a configured/detected test framework, short-circuit to avoid doing unnecessary work.
      if (this.currentTestFramework === 'none') {
        this.log.info('No test framework configured. Ignoring file change.')
        return;
      }
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

        // Send an autorun event when a relevant file changes.
        // This only causes a run if the user has autorun enabled.
        this.log.info('Sending autorun event');
        this.autorunEmitter.fire();
      }
    })
  }

  private configWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        this.cancel();
        this.currentTestFramework = undefined;
        this.load();
        this.autorunEmitter.fire();
      }
    })
  }
}
