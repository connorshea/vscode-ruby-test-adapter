import * as vscode from 'vscode';
import * as path from 'path';
import * as childProcess from 'child_process';
import split2 from 'split2';
import { IChildLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';
import { TestRunContext } from './testRunContext';
import { RspecConfig } from './rspec/rspecConfig';
import { MinitestConfig } from './minitest/minitestConfig';
import { TestSuite } from './testSuite';
import { ParsedTest } from './testLoader';

export abstract class TestRunner implements vscode.Disposable {
  protected currentChildProcess?: childProcess.ChildProcess;
  protected debugCommandStartedResolver?: Function;
  protected disposables: { dispose(): void }[] = [];
  protected readonly log: IChildLogger;

  /**
   * @param rootLog The Test Adapter logger, for logging.
   * @param workspace Open workspace folder
   * @param controller Test controller that holds the test suite
   * @param config Configuration provider
   * @param testSuite TestSuite instance
   */
  constructor(
    readonly rootLog: IChildLogger,
    protected controller: vscode.TestController,
    protected config: RspecConfig | MinitestConfig,
    protected testSuite: TestSuite,
    protected workspace?: vscode.WorkspaceFolder,
  ) {
    this.log = rootLog.getChildLogger({label: "TestRunner"})
  }

  abstract canNotifyOnStartingTests: boolean

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
  async handleChildProcess(process: childProcess.ChildProcess, context: TestRunContext): Promise<vscode.TestItem[]> {
    this.currentChildProcess = process;
    let log = this.log.getChildLogger({ label: `ChildProcess(${this.config.frameworkName()})` })
    let testIdsRun: vscode.TestItem[] = []

    process.stderr!.pipe(split2()).on('data', (data) => {
      data = data.toString();
      log.trace(data);
      if (data.startsWith('Fast Debugger') && this.debugCommandStartedResolver) {
        this.debugCommandStartedResolver()
      }
    })

    process.stdout!.pipe(split2()).on('data', (data) => {
      let getTest = (testId: string): vscode.TestItem => {
        testId = this.testSuite.normaliseTestId(testId)
        return this.testSuite.getOrCreateTestItem(testId)
      }
      if (data.startsWith('PASSED:')) {
        log.debug(`Received test status - PASSED`, data)
        context.passed(getTest(data.replace('PASSED: ', '')))
      } else if (data.startsWith('FAILED:')) {
        log.debug(`Received test status - FAILED`, data)
        let testItem = getTest(data.replace('FAILED: ', ''))
        let line = testItem.range?.start?.line ? testItem.range.start.line + 1 : 0
        context.failed(testItem, "", testItem.uri?.fsPath || "", line)
      } else if (data.startsWith('RUNNING:')) {
        log.debug(`Received test status - RUNNING`, data)
        context.started(getTest(data.replace('RUNNING: ', '')))
      } else if (data.startsWith('PENDING:')) {
        log.debug(`Received test status - PENDING`, data)
        context.skipped(getTest(data.replace('PENDING: ', '')))
      } else if (data.includes('START_OF_TEST_JSON')) {
        log.trace("Received test run results", data);
        testIdsRun = testIdsRun.concat(this.parseAndHandleTestOutput(data, context));
      } else {
        log.trace("Ignoring unrecognised output", data)
      }
    });

    await new Promise<void>((resolve, reject) => {
      process.once('exit', (code: number, signal: string) => {
        log.debug('Child process exited', code, signal)
        resolve();
      });
      process.once('error', (err: Error) => {
        reject(err);
      });
    })

    return testIdsRun
  };

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
      this.rootLog,
      token,
      request,
      this.controller
    )
    let log = this.log.getChildLogger({ label: `runHandler` })
    try {
      const queue: vscode.TestItem[] = [];

      if (debuggerConfig) {
        log.debug(`Debugging test(s) ${JSON.stringify(request.include?.map(x => x.id))}`);

        if (!this.workspace) {
          log.error("Cannot debug without a folder opened")
          context.testRun.end()
          return
        }

        this.log.info('Starting the debug session');
        let debugSession: any;
        try {
          await this.debugCommandStarted()
          debugSession = await this.startDebugging(debuggerConfig);
        } catch (err) {
          log.error('Failed starting the debug session - aborting', err);
          this.killChild();
          return;
        }

        const subscription = this.onDidTerminateDebugSession((session) => {
          if (debugSession != session) return;
          log.info('Debug session ended');
          this.killChild(); // terminate the test run
          subscription.dispose();
        });
      }
      else {
        log.debug(`Running test(s) ${JSON.stringify(request.include?.map(x => x.id))}`);
      }

      // Loop through all included tests, or all known tests, and add them to our queue
      if (request.include) {
        log.trace(`${request.include.length} tests in request`);
        request.include.forEach(test => queue.push(test));

        // For every test that was queued, try to run it
        while (queue.length > 0 && !token.isCancellationRequested) {
          const test = queue.pop()!;
          log.trace(`Running test from queue ${test.id}`);

          // Skip tests the user asked to exclude
          if (request.exclude?.includes(test)) {
            log.debug(`Skipping test excluded from test run: ${test.id}`)
            continue;
          }

          await this.runNode(context, test);
        }
        if (token.isCancellationRequested) {
          log.info(`Test run aborted due to cancellation. ${queue.length} tests remain in queue`)
        }
      } else {
        log.trace('Running all tests in suite');
        await this.runNode(context);
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
    context: TestRunContext,
    node?: vscode.TestItem,
  ): Promise<void> {
    let log = this.log.getChildLogger({label: this.runNode.name})
    // Special case handling for the root suite, since it can be run
    // with runFullTestSuite()
    try {
      let testsRun: vscode.TestItem[]
      let command: string
      if (context.request.profile?.label === 'ResolveTests') {
        command = this.config.getResolveTestsCommand(context.request.include)
      } else if (node == null) {
        log.debug("Running all tests")
        this.controller.items.forEach((testSuite) => {
          // Mark selected tests as started
          this.enqueTestAndChildren(testSuite, context)
        })
        command = this.config.getFullTestSuiteCommand(context.debuggerConfig)
      } else if (node.canResolveChildren) {
        // If the suite is a file, run the tests as a file rather than as separate tests.
        log.debug(`Running test file/folder: ${node.id}`)

        // Mark selected tests as started
        this.enqueTestAndChildren(node, context)

        command = this.config.getTestFileCommand(node, context.debuggerConfig)
      } else {
        if (node.uri !== undefined) {
          log.debug(`Running single test: ${node.id}`)
          this.enqueTestAndChildren(node, context)

          // Run the test at the given line, add one since the line is 0-indexed in
          // VS Code and 1-indexed for RSpec/Minitest.
          command = this.config.getSingleTestCommand(node, context.debuggerConfig)
        } else {
          log.error("test missing file path")
          return
        }
      }
      testsRun = await this.runTestFramework(command, context)
      this.testSuite.removeMissingTests(testsRun, node)
    } finally {
      context.testRun.end()
    }
  }

  public parseAndHandleTestOutput(testOutput: string, context?: TestRunContext): vscode.TestItem[] {
    let log = this.log.getChildLogger({label: this.parseAndHandleTestOutput.name})
    testOutput = TestRunner.getJsonFromOutput(testOutput);
    log.trace('Parsing the below JSON:');
    log.trace(`${testOutput}`);
    let testMetadata = JSON.parse(testOutput);
    let tests: Array<ParsedTest> = testMetadata.examples;

    let parsedTests: vscode.TestItem[] = []
    if (tests && tests.length > 0) {
      tests.forEach((test: ParsedTest) => {
        test.id = this.testSuite.normaliseTestId(test.id)

        // RSpec provides test ids like "file_name.rb[1:2:3]".
        // This uses the digits at the end of the id to create
        // an array of numbers representing the location of the
        // test in the file.
        let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
        let testNumber = test_location_array[test_location_array.length - 1];
        test.file_path = this.testSuite.normaliseTestId(test.file_path).replace(/\[.*/, '')
        let currentFileLabel = test.file_path.split(path.sep).slice(-1)[0]
        let pascalCurrentFileLabel = this.snakeToPascalCase(currentFileLabel.replace('_spec.rb', ''));
        // If the test doesn't have a name (because it uses the 'it do' syntax), "test #n"
        // is appended to the test description to distinguish between separate tests.
        let description: string = test.description.startsWith('example at ') ? `${test.full_description}test #${testNumber}` : test.full_description;

        // If the current file label doesn't have a slash in it and it starts with the PascalCase'd
        // file name, remove the from the start of the description. This turns, e.g.
        // `ExternalAccount Validations blah blah blah' into 'Validations blah blah blah'.
        if (!pascalCurrentFileLabel.includes('/') && description.startsWith(pascalCurrentFileLabel)) {
          // Optional check for a space following the PascalCase file name. In some
          // cases, e.g. 'FileName#method_name` there's no space after the file name.
          let regexString = `${pascalCurrentFileLabel}[ ]?`;
          let regex = new RegExp(regexString, "g");
          description = description.replace(regex, '');
        }
        test.description = description
        let test_location_string: string = test_location_array.join('');
        test.location = parseInt(test_location_string);

        let newTestItem = this.testSuite.getOrCreateTestItem(test.id)
        newTestItem.canResolveChildren = !test.id.endsWith(']')
        log.trace(`canResolveChildren (${test.id}): ${newTestItem.canResolveChildren}`)
        log.trace(`Setting test ${newTestItem.id} label to "${description}"`)
        newTestItem.label = description
        newTestItem.range = new vscode.Range(test.line_number - 1, 0, test.line_number, 0);
        parsedTests.push(newTestItem)
        log.trace("Parsed test", test)
        if(context) {
          // Only handle status if actual test run, not dry run
          this.handleStatus(test, context);
        }
      });
      return parsedTests
    }
    return []
  }

  /**
   * Convert a string from snake_case to PascalCase.
   * Note that the function will return the input string unchanged if it
   * includes a '/'.
   *
   * @param string The string to convert to PascalCase.
   * @return The converted string.
   */
  private snakeToPascalCase(string: string): string {
    if (string.includes('/')) { return string }
    return string.split("_").map(substr => substr.charAt(0).toUpperCase() + substr.slice(1)).join("");
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
    if (this.canNotifyOnStartingTests) {
      // Tests will be marked as started as the runner gets to them
      context.enqueued(test);
    } else {
      context.started(test);
    }
    if (test.children && test.children.size > 0) {
      test.children.forEach(child => { this.enqueTestAndChildren(child, context) })
    }
  }

  /**
   * Spawns a child process to run a command, that will be killed
   * if the cancellation token is triggered
   *
   * @param testCommand The command to run
   * @param context Test run context for the cancellation token
   * @returns Raw output from process
   */
  protected async runTestFramework (testCommand: string, context: TestRunContext): Promise<vscode.TestItem[]> {
    context.token.onCancellationRequested(() => {
      this.log.debug("Cancellation requested")
      this.killChild()
    })

    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace?.uri.fsPath,
      shell: true,
      env: this.config.getProcessEnv()
    };

    this.log.debug(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    return await this.handleChildProcess(testProcess, context);
  }

  /**
   * Handles test state based on the output returned by the test command.
   *
   * @param test The parsed output from running the test
   * @param context Test run context
   */
  protected abstract handleStatus(test: ParsedTest, context: TestRunContext): void;
}
