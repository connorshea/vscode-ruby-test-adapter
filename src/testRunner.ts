import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as split2 from 'split2';
import { IVSCodeExtLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';
import { TestRunContext } from './testRunContext';

export abstract class TestRunner implements vscode.Disposable {
  protected currentChildProcess: childProcess.ChildProcess | undefined;
  protected testSuite: vscode.TestItem[] | undefined;
  protected debugCommandStartedResolver: Function | undefined;
  protected disposables: { dispose(): void }[] = [];

  /**
   * @param context Extension context provided by vscode.
   * @param testStatesEmitter An emitter for the test suite's state.
   * @param log The Test Adapter logger, for logging.
   */
  constructor(
    protected context: vscode.ExtensionContext,
    protected log: IVSCodeExtLogger,
    protected workspace: vscode.WorkspaceFolder | null,
    protected controller: vscode.TestController
  ) {}

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  protected abstract getProcessEnv(): any

  /**
   * Initialise the test framework, parse tests (without executing) and retrieve the output
   * @return Stdout outpu from framework initialisation
   */
  abstract initTests: () => Promise<string>;

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
  * Get the user-configured test file pattern.
  *
  * @return The file pattern
  */
  getFilePattern(): Array<string> {
    let pattern: Array<string> = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('filePattern') as Array<string>);
    return pattern || ['*_test.rb', 'test_*.rb'];
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The test directory
   */
  abstract getTestDirectory(): string;

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

    this.currentChildProcess.on('exit', () => {
      this.log.info('Child process has exited. Sending test run finish event.');
      this.currentChildProcess = undefined;
      context.testRun.end()
      resolve('{}');
    });

    this.currentChildProcess.stderr!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      this.log.debug(`[CHILD PROCESS OUTPUT] ${data}`);
      if (data.startsWith('Fast Debugger') && this.debugCommandStartedResolver) {
        this.debugCommandStartedResolver()
      }
    });

    // TODO: Parse test IDs, durations, and failure message(s) from data
    this.currentChildProcess.stdout!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      this.log.debug(`[CHILD PROCESS OUTPUT] ${data}`);
      if (data.startsWith('PASSED:')) {
        data = data.replace('PASSED: ', '');
        context.passed(data)
      } else if (data.startsWith('FAILED:')) {
        data = data.replace('FAILED: ', '');
        context.failed(data, "", "", 0)
      } else if (data.startsWith('RUNNING:')) {
        data = data.replace('RUNNING: ', '');
        context.started(data)
      } else if (data.startsWith('PENDING:')) {
        data = data.replace('PENDING: ', '');
        context.enqueued(data)
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
      debuggerConfig
    )
    const queue: vscode.TestItem[] = [];
  
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

        test.children.forEach(test => queue.push(test));
      }
      if (token.isCancellationRequested) {
        this.log.debug(`Test run aborted due to cancellation. ${queue.length} tests remain in queue`)
      }
    } else {
      await this.runNode(null, context);
    }
  
    // Make sure to end the run after all tests have been executed:
    context.testRun.end();
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
    // Special case handling for the root suite, since it can be run
    // with runFullTestSuite()
    if (node == null) {
      //this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });
      this.controller.items.forEach((testSuite) => {
        this.enqueTestAndChildren(testSuite, context)
      })
      let testOutput = await this.runFullTestSuite(context);
      testOutput = TestRunner.getJsonFromOutput(testOutput);
      this.log.debug('Parsing the below JSON:');
      this.log.debug(`${testOutput}`);
      let testMetadata = JSON.parse(testOutput);
      let tests: Array<any> = testMetadata.examples;

      if (tests && tests.length > 0) {
        tests.forEach((test: { id: string; }) => {
          this.handleStatus(test, context);
        });
      }
      // If the suite is a file, run the tests as a file rather than as separate tests.
    } else if (node.label.endsWith('.rb')) {
      // Mark selected tests as enqueued
      this.enqueTestAndChildren(node, context)

      context.started(node)
      let testOutput = await this.runTestFile(`${node.uri?.fsPath}`, context);

      testOutput = TestRunner.getJsonFromOutput(testOutput);
      this.log.debug('Parsing the below JSON:');
      this.log.debug(`${testOutput}`);
      let testMetadata = JSON.parse(testOutput);
      let tests: Array<any> = testMetadata.examples;

      if (tests && tests.length > 0) {
        tests.forEach((test: { id: string }) => {
          this.handleStatus(test, context);
        });
      }

      if (tests.length != node.children.size + 1) {
        this.log.debug(`Test count mismatch {${node.label}}. Expected ${node.children.size + 1}, ran ${tests.length}`)
      }

      //this.testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

    } else {
      if (node.uri !== undefined && node.range !== undefined) {
        context.started(node)

        // Run the test at the given line, add one since the line is 0-indexed in
        // VS Code and 1-indexed for RSpec/Minitest.
        let testOutput = await this.runSingleTest(`${node.uri.fsPath}:${node.range?.end.line}`, context);

        testOutput = TestRunner.getJsonFromOutput(testOutput);
        this.log.debug('Parsing the below JSON:');
        this.log.debug(`${testOutput}`);
        let testMetadata = JSON.parse(testOutput);
        let currentTest = testMetadata.examples[0];

        this.handleStatus(currentTest, context);
      }
    }
  }

  public async debugCommandStarted(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      this.debugCommandStartedResolver = resolve;
      setTimeout(() => { reject("debugCommandStarted timed out") }, 10000)
    })
  }

  /**
   * Get the absolute path of the custom_formatter.rb file.
   *
   * @return The spec directory
   */
  protected getRubyScriptsLocation(): string {
    return vscode.Uri.joinPath(this.context.extensionUri, 'ruby').fsPath;
  }

  /**
   * Mark a test node and all its children as being queued for execution
   */
  private enqueTestAndChildren(test: vscode.TestItem, context: TestRunContext) {
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
    let cancelUnsubscriber = context.token.onCancellationRequested(
      (e: any) => {
        this.log.debug("Cancellation requested")
        this.killChild()
      },
      this
    )
    try {
      const spawnArgs: childProcess.SpawnOptions = {
        cwd: this.workspace?.uri.fsPath,
        shell: true,
        env: this.getProcessEnv()
      };

      this.log.info(`Running command: ${testCommand}`);

      let testProcess = childProcess.spawn(
        testCommand,
        spawnArgs
      );

      return await this.handleChildProcess(testProcess, context);
    }
    finally {
      cancelUnsubscriber.dispose()
    }
  }

  /**
   * Runs a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/test.rb:12`.
   * @param context Test run context
   * @return The raw output from running the test.
   */
  protected async runSingleTest(testLocation: string, context: TestRunContext): Promise<string> {
    this.log.info(`Running single test: ${testLocation}`);
    return await this.runTestFramework(
      this.getSingleTestCommand(testLocation, context),
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
  protected async runTestFile(testFile: string, context: TestRunContext): Promise<string> {
    this.log.info(`Running test file: ${testFile}`);
    return await this.runTestFramework(
      this.getTestFileCommand(testFile, context),
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
  protected abstract getSingleTestCommand(testLocation: string, context: TestRunContext): string;

  /**
   * Gets the command to run tests in a given file.
   *
   * @param testFile The test file's file path, e.g. `/path/to/test.rb`.
   * @param context Test run context
   * @return The raw output from running the tests.
   */
  protected abstract getTestFileCommand(testFile: string, context: TestRunContext): string;

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
  protected abstract handleStatus(test: any, context: TestRunContext): void;
}
