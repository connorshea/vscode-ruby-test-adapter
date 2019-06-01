import * as vscode from 'vscode';
import { TestSuiteInfo, TestEvent } from 'vscode-test-adapter-api';
import * as childProcess from 'child_process';
import { Tests } from './tests';

export class RspecTests extends Tests {
  testFrameworkName = 'RSpec';

  /**
   * Representation of the RSpec test suite as a TestSuiteInfo object.
   *
   * @return The RSpec test suite as a TestSuiteInfo object.
   */
  tests = async () => new Promise<TestSuiteInfo>((resolve, reject) => {
    try {
      // If test suite already exists, use testSuite. Otherwise, load them.
      let rspecTests = this.testSuite ? this.testSuite : this.loadTests();
      return resolve(rspecTests);
    } catch(err) {
      this.log.error(`Error while attempting to load RSpec tests: ${err.message}`);
      return reject(err);
    }
  });

  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the RSpec JSON formatter.
   */
  initTests = async () => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getTestCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter --order defined --dry-run`;

    this.log.info(`Running dry-run of RSpec test suite with the following command: ${cmd}`);

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: vscode.workspace.rootPath,
      maxBuffer: 8192 * 8192
    };

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      if (err) {
        this.log.error(`Error while finding RSpec test suite: ${err.message}`);
        // Show an error message.
        vscode.window.showWarningMessage("Ruby Test Explorer failed to find an RSpec test suite. Make sure RSpec is installed and your configured RSpec command is correct.");
        vscode.window.showErrorMessage(err.message);
        throw err;
      }
      resolve(stdout);
    });
  });

  /**
   * Get the user-configured RSpec command, if there is one.
   *
   * @return The RSpec command
   */
  protected getTestCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
    return command || 'bundle exec rspec';
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The spec directory
   */
  getTestDirectory(): string {
    let directory: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecDirectory') as string);
    return directory || './spec/';
  }

  /**
   * Get the absolute path of the custom_formatter.rb file.
   *
   * @return The spec directory
   */
  protected getCustomFormatterLocation(): string {
    return this.context.asAbsolutePath('./custom_formatter.rb');
  }

  /**
   * Runs a single test.
   *
   * @param testLocation A file path with a line number, e.g. `/path/to/spec.rb:12`.
   * @return The raw output from running the test.
   */
  runSingleTest = async (testLocation: string) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running single test: ${testLocation}`);
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: vscode.workspace.rootPath,
      shell: true
    };

    let testCommand = `${this.getTestCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter ${testLocation}`;
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
   * @param testFile The test file's file path, e.g. `/path/to/spec.rb`.
   * @return The raw output from running the tests.
   */
  runTestFile = async (testFile: string) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running test file: ${testFile}`);
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: vscode.workspace.rootPath,
      shell: true
    };

    // Run tests for a given file at once with a single command.
    let testCommand = `${this.getTestCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter ${testFile}`;
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
   * @return The raw output from running the test suite.
   */
  runFullTestSuite = async () => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running full test suite.`);
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: vscode.workspace.rootPath,
      shell: true
    };

    let testCommand = `${this.getTestCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter`;
    this.log.info(`Running command: ${testCommand}`);

    let testProcess = childProcess.spawn(
      testCommand,
      spawnArgs
    );

    resolve(await this.handleChildProcess(testProcess));
  });

  /**
   * Handles test state based on the output returned by the custom RSpec formatter.
   *
   * @param test The test that we want to handle.
   */
  handleStatus(test: any): void {
    this.log.debug(`Handling status of test: ${JSON.stringify(test)}`);
    if (test.status === "passed") {
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'passed' });
    } else if (test.status === "failed" && test.pending_message === null) {
      // Remove linebreaks from error message.
      let errorMessageNoLinebreaks = test.exception.message.replace(/(\r\n|\n|\r)/, ' ');
      // Prepend the class name to the error message string.
      let errorMessage: string = `${test.exception.class}:\n${errorMessageNoLinebreaks}`;

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
      }

      this.testStatesEmitter.fire(<TestEvent>{
        type: 'test',
        test: test.id,
        state: 'failed',
        message: errorMessage,
        decorations: [{
          // Strip line breaks from the message.
          message: errorMessageNoLinebreaks,
          line: test.line_number - 1
        }]
      });
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'skipped', message: test.pending_message });
    }
  };
}
