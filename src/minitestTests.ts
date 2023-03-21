import * as vscode from 'vscode';
import { TestSuiteInfo, TestEvent } from 'vscode-test-adapter-api';
import * as childProcess from 'child_process';
import { Tests } from './tests';

export class MinitestTests extends Tests {
  testFrameworkName = 'Minitest';

  /**
   * Representation of the Minitest test suite as a TestSuiteInfo object.
   *
   * @return The Minitest test suite as a TestSuiteInfo object.
   */
  tests = async () => new Promise<TestSuiteInfo>((resolve, reject) => {
    try {
      // If test suite already exists, use testSuite. Otherwise, load them.
      let minitestTests = this.testSuite ? this.testSuite : this.loadTests();
      return resolve(minitestTests);
    } catch (err) {
      if (err instanceof Error) {
        this.log.error(`Error while attempting to load Minitest tests: ${err.message}`);
        return reject(err);
      }
    }
  });

  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the Minitest JSON formatter.
   */
  initTests = async () => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getTestCommand()} vscode:minitest:list`;

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace.uri.fsPath,
      maxBuffer: 8192 * 8192,
      env: this.getProcessEnv()
    };

    this.log.info(`Getting a list of Minitest tests in suite with the following command: ${cmd}`);

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      if (err) {
        this.log.error(`Error while finding Minitest test suite: ${err.message}`);
        this.log.error(`Output: ${stdout}`);
        // Show an error message.
        vscode.window.showWarningMessage("Ruby Test Explorer failed to find a Minitest test suite. Make sure Minitest is installed and your configured Minitest command is correct.");
        vscode.window.showErrorMessage(err.message);
        throw err;
      }
      resolve(stdout);
    });
  });

  /**
   * Get the user-configured Minitest command, if there is one.
   *
   * @return The Minitest command
   */
  protected getTestCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestCommand') as string) || 'bundle exec rake';
    return `${command} -R ${(process.platform == 'win32') ? '%EXT_DIR%' : '$EXT_DIR'}`;
  }

  /**
   * Get the user-configured rdebug-ide command, if there is one.
   *
   * @return The rdebug-ide command
   */
  protected getDebugCommand(debuggerConfig: vscode.DebugConfiguration): string {
    return this.buildDebugCommand(
      debuggerConfig,
      `${process.platform == 'win32' ? '%EXT_DIR%' : '$EXT_DIR'}/debug_minitest.rb`
    );
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The test directory
   */
  getTestDirectory(): string {
    let directory: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string);
    return directory || './test/';
  }

  /**
   * Get the absolute path of the custom_formatter.rb file.
   *
   * @return The spec directory
   */
  protected getRubyScriptsLocation(): string {
    return this.context.asAbsolutePath('./ruby');
  }

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  protected getProcessEnv(): any {
    return Object.assign({}, process.env, {
      "RAILS_ENV": "test",
      "EXT_DIR": this.getRubyScriptsLocation(),
      "TESTS_DIR": this.getTestDirectory(),
      "TESTS_PATTERN": this.getFilePattern().join(',')
    });
  }

  /**
  * Get test command with formatter and debugger arguments
  *
  * @param debuggerConfig A VS Code debugger configuration.
  * @return The test command
  */
  protected testCommandWithDebugger(debuggerConfig?: vscode.DebugConfiguration): string {
    let cmd = `${this.getTestCommand()} vscode:minitest:run`
    if (debuggerConfig) {
      cmd = this.getDebugCommand(debuggerConfig);
    }
    return cmd;
  }

  /**
   * Runs a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/spec.rb:12`.
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the test.
   */
  runSingleTest = async (testLocation: string, debuggerConfig?: vscode.DebugConfiguration) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running single test: ${testLocation}`);
    let line = testLocation.split(':').pop();
    let relativeLocation = testLocation.split(/:\d+$/)[0].replace(`${this.workspace.uri.fsPath}/`, "")
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace.uri.fsPath,
      shell: true,
      env: this.getProcessEnv()
    };

    let testCommand = `${this.testCommandWithDebugger(debuggerConfig)} '${relativeLocation}:${line}'`;
    this.log.info(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    resolve(await this.handleChildProcess(testProcess));
  });

  /**
   * Runs tests in a given file.
   *
   * @param testFile The test file's file path, e.g. `/path/to/test.rb`.
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the tests.
   */
  runTestFile = async (testFile: string, debuggerConfig?: vscode.DebugConfiguration) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running test file: ${testFile}`);
    let relativeFile = testFile.replace(`${this.workspace.uri.fsPath}/`, "").replace(`./`, "")
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace.uri.fsPath,
      shell: true,
      env: this.getProcessEnv()
    };

    // Run tests for a given file at once with a single command.
    let testCommand = `${this.testCommandWithDebugger(debuggerConfig)} '${relativeFile}'`;
    this.log.info(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    resolve(await this.handleChildProcess(testProcess));
  });

  /**
   * Runs the full test suite for the current workspace.
   *
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the test suite.
   */
  runFullTestSuite = async (debuggerConfig?: vscode.DebugConfiguration) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running full test suite.`);
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace.uri.fsPath,
      shell: true,
      env: this.getProcessEnv()
    };

    let testCommand = this.testCommandWithDebugger(debuggerConfig);
    this.log.info(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    resolve(await this.handleChildProcess(testProcess));
  });

  /**
   * Handles test state based on the output returned by the Minitest Rake task.
   *
   * @param test The test that we want to handle.
   */
  handleStatus(test: any): void {
    this.log.debug(`Handling status of test: ${JSON.stringify(test)}`);
    if (test.status === "passed") {
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'passed' });
    } else if (test.status === "failed" && test.pending_message === null) {
      let errorMessageShort: string = test.exception.message;
      let errorMessageLine: number = test.line_number;
      let errorMessage: string = test.exception.message;

      if (test.exception.position) {
        errorMessageLine = test.exception.position;
      }

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
        errorMessage += `\n\nFull Backtrace:\n`;
        test.exception.full_backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
      }

      this.testStatesEmitter.fire(<TestEvent>{
        type: 'test',
        test: test.id,
        state: 'failed',
        message: errorMessage,
        decorations: [{
          message: errorMessageShort,
          line: errorMessageLine - 1
        }]
      });
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'skipped', message: test.pending_message });
    }
  };
}
