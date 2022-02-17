import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as split2 from 'split2';
import { IVSCodeExtLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';

export abstract class TestRunner implements vscode.Disposable {
  protected currentChildProcess: childProcess.ChildProcess | undefined;
  protected testSuite: vscode.TestItem[] | undefined;
  abstract testFrameworkName: string;
  protected debugCommandStartedResolver: Function | undefined;

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

  abstract tests: () => Promise<vscode.TestItem[]>;

  abstract initTests: () => Promise<string>;

  public dispose() {
    this.killChild();
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
  handleChildProcess = async (process: childProcess.ChildProcess) => new Promise<string>((resolve, reject) => {
    this.currentChildProcess = process;

    this.currentChildProcess.on('exit', () => {
      this.log.info('Child process has exited. Sending test run finish event.');
      this.currentChildProcess = undefined;
      // this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
      resolve('{}');
    });

    this.currentChildProcess.stderr!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      this.log.debug(`[CHILD PROCESS OUTPUT] ${data}`);
      if (data.startsWith('Fast Debugger') && this.debugCommandStartedResolver) {
        this.debugCommandStartedResolver()
      }
    });

    this.currentChildProcess.stdout!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      this.log.debug(`[CHILD PROCESS OUTPUT] ${data}`);
      if (data.startsWith('PASSED:')) {
        data = data.replace('PASSED: ', '');
        // this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: data, state: 'passed' });
      } else if (data.startsWith('FAILED:')) {
        data = data.replace('FAILED: ', '');
        // this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: data, state: 'failed' });
      } else if (data.startsWith('RUNNING:')) {
        data = data.replace('RUNNING: ', '');
        // this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: data, state: 'running' });
      } else if (data.startsWith('PENDING:')) {
        data = data.replace('PENDING: ', '');
        // this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: data, state: 'skipped' });
      }
      if (data.includes('START_OF_TEST_JSON')) {
        resolve(data);
      }
    });
  });

  public async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken, debuggerConfig?: vscode.DebugConfiguration) {
    const run = this.controller.createTestRun(request);
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

        await this.runNode(test, token, run, debuggerConfig);

        test.children.forEach(test => queue.push(test));
      }
      if (token.isCancellationRequested) {
        this.log.debug(`Test run aborted due to cancellation. ${queue.length} tests remain in queue`)
      }
    } else {
      await this.runNode(null, token, run, debuggerConfig);
    }
  
    // Make sure to end the run after all tests have been executed:
    run.end();
  }

  /**
   * Recursively run a node or its children.
   *
   * @param node A test or test suite.
   * @param debuggerConfig A VS Code debugger configuration.
   */
  protected async runNode(
    node: vscode.TestItem | null,
    token: vscode.CancellationToken,
    testRun: vscode.TestRun,
    debuggerConfig?: vscode.DebugConfiguration
  ): Promise<void> {
    // Special case handling for the root suite, since it can be run
    // with runFullTestSuite()
    if (node == null) {
      //this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });
      testRun.enqueued
      let testOutput = await this.runFullTestSuite(token, debuggerConfig);
      testOutput = TestRunner.getJsonFromOutput(testOutput);
      this.log.debug('Parsing the below JSON:');
      this.log.debug(`${testOutput}`);
      let testMetadata = JSON.parse(testOutput);
      let tests: Array<any> = testMetadata.examples;

      if (tests && tests.length > 0) {
        tests.forEach((test: { id: string; }) => {
          this.handleStatus(test, testRun);
        });
      }
      // If the suite is a file, run the tests as a file rather than as separate tests.
    } else if (node.label.endsWith('.rb')) {
      // Mark selected tests as enqueued
      this.enqueTestAndChildren(node, testRun)

      testRun.started(node)
      let testOutput = await this.runTestFile(token, `${node.uri?.fsPath}`, debuggerConfig);

      testOutput = TestRunner.getJsonFromOutput(testOutput);
      this.log.debug('Parsing the below JSON:');
      this.log.debug(`${testOutput}`);
      let testMetadata = JSON.parse(testOutput);
      let tests: Array<any> = testMetadata.examples;

      if (tests && tests.length > 0) {
        tests.forEach((test: { id: string }) => {
          this.handleStatus(test, testRun);
        });
      }

      if (tests.length != node.children.size + 1) {
        this.log.debug(`Test count mismatch {${node.label}}. Expected ${node.children.size + 1}, ran ${tests.length}`)
      }

      //this.testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

    } else {
      if (node.uri !== undefined && node.range !== undefined) {
        testRun.started(node)

        // Run the test at the given line, add one since the line is 0-indexed in
        // VS Code and 1-indexed for RSpec/Minitest.
        let testOutput = await this.runSingleTest(token, `${node.uri.fsPath}:${node.range?.end.line}`, debuggerConfig);

        testOutput = TestRunner.getJsonFromOutput(testOutput);
        this.log.debug('Parsing the below JSON:');
        this.log.debug(`${testOutput}`);
        let testMetadata = JSON.parse(testOutput);
        let currentTest = testMetadata.examples[0];

        this.handleStatus(currentTest, testRun);
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
  private enqueTestAndChildren(test: vscode.TestItem, testRun: vscode.TestRun) {
    testRun.enqueued(test)
    if (test.children && test.children.size > 0) {
      test.children.forEach(child => { this.enqueTestAndChildren(child, testRun) })
    }
  }

  /**
   * Runs a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/test.rb:12`.
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the test.
   */
  abstract runSingleTest: (token: vscode.CancellationToken, testLocation: string, debuggerConfig?: vscode.DebugConfiguration) => Promise<string>;

  /**
   * Runs tests in a given file.
   *
   * @param testFile The test file's file path, e.g. `/path/to/test.rb`.
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the tests.
   */
  abstract runTestFile: (token: vscode.CancellationToken, testFile: string, debuggerConfig?: vscode.DebugConfiguration) => Promise<string>;

  /**
   * Runs the full test suite for the current workspace.
   *
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the test suite.
   */
  abstract runFullTestSuite: (token: vscode.CancellationToken, debuggerConfig?: vscode.DebugConfiguration) => Promise<string>;

  /**
   * Handles test state based on the output returned by the test command.
   *
   * @param test The test that we want to handle.
   * @param testRun Test run object for reporting test result
   */
  abstract handleStatus(test: any, testRun: vscode.TestRun): void;
}
