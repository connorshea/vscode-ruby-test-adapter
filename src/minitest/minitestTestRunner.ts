import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { TestRunner } from '../testRunner';
import { TestRunContext } from '../testRunContext';

export class MinitestTestRunner extends TestRunner {
  testFrameworkName = 'Minitest';

  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the Minitest JSON formatter.
   */
  initTests = async (testItems: vscode.TestItem[]) => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getTestCommand()} vscode:minitest:list`;

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace?.uri.fsPath,
      maxBuffer: 8192 * 8192,
      env: this.config.getProcessEnv()
    };

    testItems.forEach((item) => {
      cmd = `${cmd} ${item.id}`
    })

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
    let command: string =
      (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('debugCommand') as string) ||
      'rdebug-ide';

    return (
      `${command}  --host ${debuggerConfig.remoteHost} --port ${debuggerConfig.remotePort}` +
      ` -- ${process.platform == 'win32' ? '%EXT_DIR%' : '$EXT_DIR'}/debug_minitest.rb`
    );
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

  protected getSingleTestCommand(testLocation: string, context: TestRunContext): string {
    let line = testLocation.split(':').pop();
    let relativeLocation = testLocation.split(/:\d+$/)[0].replace(`${this.workspace?.uri.fsPath || "."}/`, "")
    return `${this.testCommandWithDebugger(context.debuggerConfig)} '${relativeLocation}:${line}'`
  };

  protected getTestFileCommand(testFile: string, context: TestRunContext): string {
    let relativeFile = testFile.replace(`${this.workspace?.uri.fsPath || '.'}/`, "").replace(`./`, "")
    return `${this.testCommandWithDebugger(context.debuggerConfig)} '${relativeFile}'`
  };

  protected getFullTestSuiteCommand(context: TestRunContext): string {
    return this.testCommandWithDebugger(context.debuggerConfig)
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

      context.failed(
        testItem,
        errorMessage,
        test.file_path.replace('./', ''),
        errorMessageLine - 1
      )
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      context.errored(
        testItem,
        test.pending_message,
        test.file_path.replace('./', ''),
        test.line_number
      )
    }
  };
}
