import vscode from 'vscode';
import { TestSuiteInfo, TestEvent } from 'vscode-test-adapter-api';
import childProcess from 'child_process';
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
    } catch (err) {
      if (err instanceof Error) {
        this.log.error(`Error while attempting to load RSpec tests: ${err.message}`);
        return reject(err);
      }
    }
  });

  /**
   * Perform a dry-run of the test suite to get information about every test.
   *
   * @return The raw output from the RSpec JSON formatter.
   */
  initTests = async () => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getTestCommandWithFilePattern()} --require ${this.getCustomFormatterLocation()}`
              + ` --format CustomFormatter --order defined --dry-run`;

    this.log.info(`Running dry-run of RSpec test suite with the following command: ${cmd}`);

    // Allow a buffer of 64MB.
    const execArgs: childProcess.ExecOptions = {
      cwd: this.workspace.uri.fsPath,
      maxBuffer: 8192 * 8192
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
            let outputJson = JSON.parse(Tests.getJsonFromOutput(stdout));
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
   * Get the user-configured RSpec command, if there is one.
   *
   * @return The RSpec command
   */
  protected getTestCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
    return command || `bundle exec rspec`
  }

  /**
   * Get the user-configured rdebug-ide command, if there is one.
   *
   * @return The rdebug-ide command
   */
  protected getDebugCommand(debuggerConfig: vscode.DebugConfiguration, args: string): string {
    let command: string =
      (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('debugCommand') as string) ||
      'rdebug-ide';

    return (
      `${command} --host ${debuggerConfig.remoteHost} --port ${debuggerConfig.remotePort}` +
      ` -- ${process.platform == 'win32' ? '%EXT_DIR%' : '$EXT_DIR'}/debug_rspec.rb ${args}`
    );
  }
  /**
   * Get the user-configured RSpec command and add file pattern detection.
   *
   * @return The RSpec command
   */
  protected getTestCommandWithFilePattern(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
    const dir = this.getTestDirectory();
    let pattern = this.getFilePattern().map(p => `${dir}/**{,/*/**}/${p}`).join(',')
    command = command || `bundle exec rspec`
    return `${command} --pattern '${pattern}'`;
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
   * Get test command with formatter and debugger arguments
   *
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The test command
   */
  protected testCommandWithFormatterAndDebugger(debuggerConfig?: vscode.DebugConfiguration): string {
    let args = `--require ${this.getCustomFormatterLocation()} --format CustomFormatter`
    let cmd = `${this.getTestCommand()} ${args}`
    if (debuggerConfig) {
      cmd = this.getDebugCommand(debuggerConfig, args);
    }
    return cmd
  }

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  protected getProcessEnv(): any {
    return Object.assign({}, process.env, {
      "EXT_DIR": this.getRubyScriptsLocation(),
    });
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
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace.uri.fsPath,
      shell: true,
      env: this.getProcessEnv()
    };

    let testCommand = `${this.testCommandWithFormatterAndDebugger(debuggerConfig)} '${testLocation}'`;
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
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The raw output from running the tests.
   */
  runTestFile = async (testFile: string, debuggerConfig?: vscode.DebugConfiguration) => new Promise<string>(async (resolve, reject) => {
    this.log.info(`Running test file: ${testFile}`);
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace.uri.fsPath,
      shell: true
    };

    // Run tests for a given file at once with a single command.
    let testCommand = `${this.testCommandWithFormatterAndDebugger(debuggerConfig)} '${testFile}'`;
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
      shell: true
    };

    let testCommand = this.testCommandWithFormatterAndDebugger(debuggerConfig);
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

      this.testStatesEmitter.fire(<TestEvent>{
        type: 'test',
        test: test.id,
        state: 'failed',
        message: errorMessage,
        decorations: [{
          // Strip line breaks from the message.
          message: errorMessageNoLinebreaks,
          line: (fileBacktraceLineNumber ? fileBacktraceLineNumber : test.line_number) - 1
        }]
      });
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'skipped', message: test.pending_message });
    }
  };
}
