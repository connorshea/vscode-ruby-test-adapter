import * as vscode from 'vscode';
import * as path from 'path'
import * as childProcess from 'child_process';
import { TestRunner } from '../testRunner';
import { TestRunContext } from '../testRunContext';
import { MinitestConfig } from './minitestConfig';

export class MinitestTestRunner extends TestRunner {
  testFrameworkName = 'Minitest';

  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the Minitest JSON formatter.
   */
  async initTests(testItems: vscode.TestItem[]): Promise<string> {
    let cmd = this.getListTestsCommand(testItems)

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace?.uri.fsPath,
      maxBuffer: 8192 * 8192,
      env: this.config.getProcessEnv()
    };

    this.log.info(`Getting a list of Minitest tests in suite with the following command: ${cmd}`);

    let output: Promise<string> = new Promise((resolve, reject) => {
      childProcess.exec(cmd, execArgs, (err, stdout) => {
        if (err) {
          this.log.error(`Error while finding Minitest test suite: ${err.message}`);
          this.log.error(`Output: ${stdout}`);
          // Show an error message.
          vscode.window.showWarningMessage("Ruby Test Explorer failed to find a Minitest test suite. Make sure Minitest is installed and your configured Minitest command is correct.");
          vscode.window.showErrorMessage(err.message);
          reject(err);
        }
        resolve(stdout);
      });
    });
    return await output
  };

  protected getListTestsCommand(testItems?: vscode.TestItem[]): string {
    return `${(this.config as MinitestConfig).getTestCommand()} vscode:minitest:list`
  }

  protected getSingleTestCommand(testItem: vscode.TestItem, context: TestRunContext): string {
    let line = testItem.id.split(':').pop();
    let relativeLocation = `${context.config.getAbsoluteTestDirectory()}${path.sep}${testItem.id}`
    return `${(this.config as MinitestConfig).testCommandWithDebugger(context.debuggerConfig)} '${relativeLocation}:${line}'`
  };

  protected getTestFileCommand(testItem: vscode.TestItem, context: TestRunContext): string {
    let relativeFile = `${context.config.getAbsoluteTestDirectory()}${path.sep}${testItem.id}`
    return `${(this.config as MinitestConfig).testCommandWithDebugger(context.debuggerConfig)} '${relativeFile}'`
  };

  protected getFullTestSuiteCommand(context: TestRunContext): string {
    return (this.config as MinitestConfig).testCommandWithDebugger(context.debuggerConfig)
  };

  /**
   * Handles test state based on the output returned by the Minitest Rake task.
   *
   * @param test The test that we want to handle.
   * @param context Test run context
   */
  handleStatus(test: any, context: TestRunContext): void {
    this.log.debug(`Handling status of test: ${JSON.stringify(test)}`);
    let testItem = this.testSuite.getOrCreateTestItem(test.id)
    if (test.status === "passed") {
      context.passed(testItem)
    } else if (test.status === "failed" && test.pending_message === null) {
      // Failed/Errored
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

      if (test.exception.class === "Minitest::UnexpectedError") {
        context.errored(
          testItem,
          errorMessage,
          test.file_path.replace('./', ''),
          errorMessageLine - 1
        )
      } else {
        context.failed(
          testItem,
          errorMessage,
          test.file_path.replace('./', ''),
          errorMessageLine - 1
        )
      }
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      context.skipped(testItem)
    }
  };
}
