import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { TestRunner } from '../testRunner';
import { TestRunContext } from '../testRunContext';
import { RspecConfig } from './rspecConfig';

export class RspecTestRunner extends TestRunner {
  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the RSpec JSON formatter.
   */
  initTests = async () => new Promise<string>((resolve, reject) => {
    let cfg = this.config as RspecConfig
    let cmd = `${cfg.getTestCommandWithFilePattern()} --require ${cfg.getCustomFormatterLocation()}`
              + ` --format CustomFormatter --order defined --dry-run`;

    // TODO: Only reload single file on file changed
    // if (testFilePath) {
    //   cmd = cmd + ` ${testFilePath}`
    // }

    this.log.info(`Running dry-run of RSpec test suite with the following command: ${cmd}`);
    this.log.debug(`cwd: ${__dirname}`)
    this.log.debug(`child process cwd: ${this.workspace?.uri.fsPath}`)

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace?.uri.fsPath,
      maxBuffer: 8192 * 8192,
    };

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      if (err) {
        this.log.error(`Error while finding RSpec test suite: ${err.message}`);
        // Show an error message.
        vscode.window.showWarningMessage(
          "Ruby Test Explorer failed to find an RSpec test suite. Make sure RSpec is installed and your configured RSpec command is correct.",
          "View error message"
        ).then(selection => {
          if (selection === "View error message") {
            let outputJson = JSON.parse(TestRunner.getJsonFromOutput(stdout));
            let outputChannel = vscode.window.createOutputChannel('Ruby Test Explorer Error Message');

            if (outputJson.messages.length > 0) {
              let outputJsonString = outputJson.messages.join("\n\n");
              let outputJsonArray = outputJsonString.split("\n");
              outputJsonArray.forEach((line: string) => {
                outputChannel.appendLine(line);
              })
            } else {
              outputChannel.append(err.message);
            }
            outputChannel.show(false);
          }
        });

        throw err;
      }
      resolve(stdout);
    });
  });

  /**
   * Handles test state based on the output returned by the custom RSpec formatter.
   *
   * @param test The test that we want to handle.
   * @param context Test run context
   */
  handleStatus(test: any, context: TestRunContext): void {
    this.log.debug(`Handling status of test: ${JSON.stringify(test)}`);
    if (test.status === "passed") {
      context.passed(test.id)
    } else if (test.status === "failed" && test.pending_message === null) {
      // Remove linebreaks from error message.
      let errorMessageNoLinebreaks = test.exception.message.replace(/(\r\n|\n|\r)/, ' ');
      // Prepend the class name to the error message string.
      let errorMessage: string = `${test.exception.class}:\n${errorMessageNoLinebreaks}`;

      let fileBacktraceLineNumber: number | undefined;

      let filePath = test.file_path.replace('./', '');

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
          // If the backtrace line includes the current file path, try to get the line number from it.
          if (line.includes(filePath)) {
            let filePathArray = filePath.split('/');
            let fileName = filePathArray[filePathArray.length - 1];
            // Input: spec/models/game_spec.rb:75:in `block (3 levels) in <top (required)>
            // Output: 75
            let regex = new RegExp(`${fileName}\:(\\d+)`);
            let match = line.match(regex);
            if (match && match[1]) {
              fileBacktraceLineNumber = parseInt(match[1]);
            }
          }
        });
      }

      context.failed(
        test.id,
        errorMessage,
        filePath,
        (fileBacktraceLineNumber ? fileBacktraceLineNumber : test.line_number) - 1,
      )
    } else if ((test.status === "pending" || test.status === "failed") && test.pending_message !== null) {
      // Handle pending test cases.
      context.skipped(test.id)
    }
  };

  protected getSingleTestCommand(testLocation: string, context: TestRunContext): string {
    return `${(this.config as RspecConfig).testCommandWithFormatterAndDebugger(context.debuggerConfig)} '${testLocation}'`
  };

  protected getTestFileCommand(testFile: string, context: TestRunContext): string {
    return `${(this.config as RspecConfig).testCommandWithFormatterAndDebugger(context.debuggerConfig)} '${testFile}'`
  };

  protected getFullTestSuiteCommand(context: TestRunContext): string {
    return (this.config as RspecConfig).testCommandWithFormatterAndDebugger(context.debuggerConfig)
  };
}
