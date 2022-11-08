import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as path from 'path'
import split2 from 'split2';
import { IChildLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';
import { TestRunContext } from './testRunContext';
import { RspecConfig } from './rspec/rspecConfig';
import { MinitestConfig } from './minitest/minitestConfig';
import { TestSuite } from './testSuite';
import { ParsedTest } from './testLoader';

export abstract class TestRunner implements vscode.Disposable {
  protected currentChildProcess: childProcess.ChildProcess | undefined;
  protected debugCommandStartedResolver: Function | undefined;
  protected disposables: { dispose(): void }[] = [];
  protected readonly log: IChildLogger;

  /**
   * @param log The Test Adapter logger, for logging.
   * @param workspace Open workspace folder
   * @param controller Test controller that holds the test suite
   */
  constructor(
    rootLog: IChildLogger,
    protected workspace: vscode.WorkspaceFolder | undefined,
    protected controller: vscode.TestController,
    protected config: RspecConfig | MinitestConfig,
    protected testSuite: TestSuite,
  ) {
    this.log = rootLog.getChildLogger({label: "TestRunner"})
  }

  /**
   * Initialise the test framework, parse tests (without executing) and retrieve the output
   * @return Stdout outpu from framework initialisation
   */
  abstract initTests: (testItems: vscode.TestItem[]) => Promise<string>;

  public dispose() {
    this.killChild();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Kills the current child process if one exists.
   */
  public killChild(): void {
    if (this.currentChildProcess) {
      this.currentChildProcess.kill();
    }
  }

  /**
   * Pull JSON out of the test framework output.
   *
   * RSpec and Minitest frequently return bad data even when they're told to
   * format the output as JSON, e.g. due to code coverage messages and other
   * injections from gems. This gets the JSON by searching for
   * `START_OF_TEST_JSON` and an opening curly brace, as well as a closing
   * curly brace and `END_OF_TEST_JSON`. These are output by the custom
   * RSpec formatter or Minitest Rake task as part of the final JSON output.
   *
   * @param output The output returned by running a command.
   * @return A string representation of the JSON found in the output.
   */
  static getJsonFromOutput(output: string): string {
    output = output.substring(output.indexOf('START_OF_TEST_JSON{'), output.lastIndexOf('}END_OF_TEST_JSON') + 1);
    // Get rid of the `START_OF_TEST_JSON` and `END_OF_TEST_JSON` to verify that the JSON is valid.
    return output.substring(output.indexOf("{"), output.lastIndexOf("}") + 1);
  }

  /**
   * Get the location of the test in the testing tree.
   *
   * Test ids are in the form of `/spec/model/game_spec.rb[1:1:1]`, and this
   * function turns that into `111`. The number is used to order the tests
   * in the explorer.
   *
   * @param test The test we want to get the location of.
   * @return A number representing the location of the test in the test tree.
   */
  protected getTestLocation(test: vscode.TestItem): number {
    return parseInt(test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':').join(''));
  }

  // /**
  //  * Sorts an array of TestSuiteInfo objects by label.
  //  *
  //  * @param testSuiteChildren An array of TestSuiteInfo objects, generally the children of another TestSuiteInfo object.
  //  * @return The input array, sorted by label.
  //  */
  // protected sortTestSuiteChildren(testSuiteChildren: Array<TestSuiteInfo>): Array<TestSuiteInfo> {
  //   testSuiteChildren = testSuiteChildren.sort((a: TestSuiteInfo, b: TestSuiteInfo) => {
  //     let comparison = 0;
  //     if (a.label > b.label) {
  //       comparison = 1;
  //     } else if (a.label < b.label) {
  //       comparison = -1;
  //     }
  //     return comparison;
  //   });

  //   return testSuiteChildren;
  // }

  /**
   * Assigns the process to currentChildProcess and handles its output and what happens when it exits.
   *
   * @param process A process running the tests.
   * @return A promise that resolves when the test run completes.
   */
  handleChildProcess = async (process: childProcess.ChildProcess, context: TestRunContext) => new Promise<string>((resolve, reject) => {
    this.currentChildProcess = process;
    let childProcessLogger = this.log.getChildLogger({ label: `ChildProcess(${context.config.frameworkName()})` })

    this.currentChildProcess.on('exit', () => {
      childProcessLogger.info('Child process has exited. Sending test run finish event.');
      this.currentChildProcess = undefined;
      resolve('{}');
    });

    this.currentChildProcess.stderr!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      childProcessLogger.debug(data);
      if (data.startsWith('Fast Debugger') && this.debugCommandStartedResolver) {
        this.debugCommandStartedResolver()
      }
    });

    // TODO: Parse test IDs, durations, and failure message(s) from data
    this.currentChildProcess.stdout!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      childProcessLogger.debug(data);
      let markTestStatus = (fn: (test: vscode.TestItem) => void, testId: string) => {
        if (testId.startsWith(`.${path.sep}`)) {
          testId = testId.substring(2)
        }
        if (testId.startsWith(this.config.getTestDirectory())) {
          testId = testId.replace(this.config.getTestDirectory(), '')
          if (testId.startsWith(path.sep)) {
            testId = testId.substring(1)
          }
        }
        let test = this.testSuite.getOrCreateTestItem(testId)
        context.passed(test)
      }
      if (data.startsWith('PASSED:')) {
        data = data.replace('PASSED: ', '');
        markTestStatus(test => context.passed(test), data)
      } else if (data.startsWith('FAILED:')) {
        data = data.replace('FAILED: ', '');
        markTestStatus(test => context.failed(test, "", "", 0), data)
      } else if (data.startsWith('RUNNING:')) {
        data = data.replace('RUNNING: ', '');
        markTestStatus(test => context.started(test), data)
      } else if (data.startsWith('PENDING:')) {
        data = data.replace('PENDING: ', '');
        markTestStatus(test => context.enqueued(test), data)
      }
      if (data.includes('START_OF_TEST_JSON')) {
        resolve(data);
      }
    });
  });

  /**
   * Test run handler
   *
   * Called by VSC when a user requests a test run
   * @param request Request containing tests to be run and tests to be excluded from the run
   * @param token Cancellation token which will trigger when a user cancels a test run
   * @param debuggerConfig VSC Debugger configuration if a debug run was requested, or `null`
   */
  public async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    debuggerConfig?: vscode.DebugConfiguration
  ) {
    const context = new TestRunContext(
      this.log,
      token,
      request,
      this.controller,
      this.config,
      debuggerConfig
    )
    try {
      const queue: vscode.TestItem[] = [];

      if (debuggerConfig) {
        this.log.info(`Debugging test(s) ${JSON.stringify(request.include)}`);

        if (!this.workspace) {
          this.log.error("Cannot debug without a folder opened")
          context.testRun.end()
          return
        }

        this.log.info('Starting the debug session');
        let debugSession: any;
        try {
          await this.debugCommandStarted()
          debugSession = await this.startDebugging(debuggerConfig);
        } catch (err) {
          this.log.error('Failed starting the debug session - aborting', err);
          this.killChild();
          return;
        }

        const subscription = this.onDidTerminateDebugSession((session) => {
          if (debugSession != session) return;
          this.log.info('Debug session ended');
          this.killChild(); // terminate the test run
          subscription.dispose();
        });
      }
      else {
        this.log.info(`Running test(s) ${JSON.stringify(request.include)}`);
      }

      // Loop through all included tests, or all known tests, and add them to our queue
      if (request.include) {
        request.include.forEach(test => queue.push(test));

        // For every test that was queued, try to run it. Call run.passed() or run.failed()
        while (queue.length > 0 && !token.isCancellationRequested) {
          const test = queue.pop()!;

          // Skip tests the user asked to exclude
          if (request.exclude?.includes(test)) {
            continue;
          }

          await this.runNode(test, context);

          test.children.forEach(test => {
            if (test.id.endsWith('.rb')) {
              // Only add files, not all the single test cases
              queue.push(test)
            }
          });
        }
        if (token.isCancellationRequested) {
          this.log.debug(`Test run aborted due to cancellation. ${queue.length} tests remain in queue`)
        }
      } else {
        await this.runNode(null, context);
      }
    }
    finally {
      // Make sure to end the run after all tests have been executed:
      context.testRun.end();
    }
  }

  private async startDebugging(debuggerConfig: vscode.DebugConfiguration): Promise<vscode.DebugSession> {
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

    if (!this.workspace) {
      throw new Error("Cannot debug without a folder open")
    }

    const started = await vscode.debug.startDebugging(this.workspace, debuggerConfig);
    if (started) {
      return await debugSessionPromise;
    } else {
      throw new Error('Debug session couldn\'t be started');
    }
  }

  private onDidTerminateDebugSession(cb: (session: vscode.DebugSession) => any): vscode.Disposable {
    return vscode.debug.onDidTerminateDebugSession(cb);
  }

  /**
   * Recursively run a node or its children.
   *
   * @param node A test or test suite.
   * @param context Test run context
   */
  protected async runNode(
    node: vscode.TestItem | null,
    context: TestRunContext
  ): Promise<void> {
    let log = this.log.getChildLogger({label: "runNode"})
    // Special case handling for the root suite, since it can be run
    // with runFullTestSuite()
    try {
      if (node == null) {
        log.debug("Running all tests")
        this.controller.items.forEach((testSuite) => {
          this.enqueTestAndChildren(testSuite, context)
        })
        let testOutput = await this.runFullTestSuite(context);
        this.parseAndHandleTestOutput(testOutput, context)
        // If the suite is a file, run the tests as a file rather than as separate tests.
      } else if (node.label.endsWith('.rb')) {
        log.debug(`Running test file: ${node.id}`)
        // Mark selected tests as enqueued
        this.enqueTestAndChildren(node, context)

        context.started(node)
        let testOutput = await this.runTestFile(node, context);

        this.parseAndHandleTestOutput(testOutput, context)
      } else {
        if (node.uri !== undefined && node.range !== undefined) {
          log.debug(`Running single test: ${node.id}`)
          context.started(node)

          // Run the test at the given line, add one since the line is 0-indexed in
          // VS Code and 1-indexed for RSpec/Minitest.
          let testOutput = await this.runSingleTest(node, context);

          this.parseAndHandleTestOutput(testOutput, context)
        }
      }
    } finally {
      context.testRun.end()
    }
  }

  private parseAndHandleTestOutput(testOutput: string, context: TestRunContext) {
    let log = this.log.getChildLogger({label: 'parseAndHandleTestOutput'})
    testOutput = TestRunner.getJsonFromOutput(testOutput);
    log.debug('Parsing the below JSON:');
    log.debug(`${testOutput}`);
    let testMetadata = JSON.parse(testOutput);
    let tests: Array<ParsedTest> = testMetadata.examples;

    if (tests && tests.length > 0) {
      tests.forEach((test: ParsedTest) => {
        test.id = this.testSuite.normaliseTestId(test.id)
        this.handleStatus(test, context);
      });
    }
  }

  public async debugCommandStarted(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      this.debugCommandStartedResolver = resolve;
      setTimeout(() => { reject("debugCommandStarted timed out") }, 10000)
    })
  }

  /**
   * Mark a test node and all its children as being queued for execution
   */
  private enqueTestAndChildren(test: vscode.TestItem, context: TestRunContext) {
    let log = this.log.getChildLogger({label: "enqueTestAndChildren"})
    log.debug(`enqueing test ${test.id}`)
    context.enqueued(test);
    if (test.children && test.children.size > 0) {
      test.children.forEach(child => { this.enqueTestAndChildren(child, context) })
    }
  }

  /**
   * Runs the test framework with the given command.
   *
   * @param testCommand Command to use to run the test framework
   * @param type Type of test run for logging (full, single file, single test)
   * @param context Test run context
   * @return The raw output from running the test suite.
   */
  runTestFramework = async (testCommand: string, type: string, context: TestRunContext) =>
  new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running test suite: ${type}`);

    resolve(await this.spawnCancellableChild(testCommand, context))
  });

  /**
   * Spawns a child process to run a command, that will be killed
   * if the cancellation token is triggered
   *
   * @param testCommand The command to run
   * @param context Test run context for the cancellation token
   * @returns Raw output from process
   */
  protected async spawnCancellableChild (testCommand: string, context: TestRunContext): Promise<string> {
    context.token.onCancellationRequested(() => {
      this.log.debug("Cancellation requested")
      this.killChild()
    })

    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace?.uri.fsPath,
      shell: true,
      env: context.config.getProcessEnv()
    };

    this.log.info(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    return await this.handleChildProcess(testProcess, context);
  }

  /**
   * Runs a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/test.rb:12`.
   * @param context Test run context
   * @return The raw output from running the test.
   */
  protected async runSingleTest(testItem: vscode.TestItem, context: TestRunContext): Promise<string> {
    this.log.info(`Running single test: ${testItem.id}`);
    return await this.runTestFramework(
      this.getSingleTestCommand(testItem, context),
      "single test",
      context)
  }

  /**
   * Runs tests in a given file.
   *
   * @param testFile The test file's file path, e.g. `/path/to/test.rb`.
   * @param context Test run context
   * @return The raw output from running the tests.
   */
  protected async runTestFile(testItem: vscode.TestItem, context: TestRunContext): Promise<string> {
    this.log.info(`Running test file: ${testItem}`);
    return await this.runTestFramework(
      this.getTestFileCommand(testItem, context),
      "test file",
      context)
  }

  /**
   * Runs the full test suite for the current workspace.
   *
   * @param context Test run context
   * @return The raw output from running the test suite.
   */
  protected async runFullTestSuite(context: TestRunContext): Promise<string> {
    this.log.info(`Running full test suite.`);
    return await this.runTestFramework(
      this.getFullTestSuiteCommand(context),
      "all tests",
      context)
  }

  /**
   * Gets the command to run a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/test.rb:12`.
   * @param context Test run context
   * @return The raw output from running the test.
   */
  protected abstract getSingleTestCommand(testItem: vscode.TestItem, context: TestRunContext): string;

  /**
   * Gets the command to run tests in a given file.
   *
   * @param testFile The test file's file path, e.g. `/path/to/test.rb`.
   * @param context Test run context
   * @return The raw output from running the tests.
   */
  protected abstract getTestFileCommand(testItem: vscode.TestItem, context: TestRunContext): string;

  /**
   * Gets the command to run the full test suite for the current workspace.
   *
   * @param context Test run context
   * @return The raw output from running the test suite.
   */
  protected abstract getFullTestSuiteCommand(context: TestRunContext): string;

  /**
   * Handles test state based on the output returned by the test command.
   *
   * @param test The test that we want to handle.
   * @param context Test run context
   */
  protected abstract handleStatus(test: ParsedTest, context: TestRunContext): void;
}