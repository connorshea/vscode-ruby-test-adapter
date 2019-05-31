import * as vscode from 'vscode';
import { TestSuiteInfo, TestInfo, TestEvent } from 'vscode-test-adapter-api';
import * as childProcess from 'child_process';
import { Tests } from './tests';

export class RspecTests extends Tests {

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
  initRspecTests = async () => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter --order defined --dry-run`;

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
   * Takes the output from initRSpecTests() and parses the resulting
   * JSON into a TestSuiteInfo object.
   *
   * @return The full RSpec test suite.
   */
  public async loadTests(): Promise<TestSuiteInfo> {
    let output = await this.initRspecTests();
    this.log.debug('Passing raw output from dry-run into getJsonFromRspecOutput.');
    this.log.debug(`${output}`);
    output = this.getJsonFromOutput(output);
    this.log.debug('Parsing the below JSON:');
    this.log.debug(`${output}`);
    let rspecMetadata = JSON.parse(output);

    let tests: Array<{ id: string; full_description: string; description: string; file_path: string; line_number: number; location: number; }> = [];

    rspecMetadata.examples.forEach((test: { id: string; full_description: string; description: string; file_path: string; line_number: number; location: number; }) => {
      let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
      let test_location_string: string = test_location_array.join('');
      test.location = parseInt(test_location_string);

      tests.push(test);
    });

    let testSuite: TestSuiteInfo = await this.getBaseTestSuite(tests);

    // Sort the children of each test suite based on their location in the test tree.
    (testSuite.children as Array<TestSuiteInfo>).forEach((suite: TestSuiteInfo) => {
      // NOTE: This will only sort correctly if everything is nested at the same
      // level, e.g. 111, 112, 121, etc. Once a fourth level of indentation is
      // introduced, the location is generated as e.g. 1231, which won't
      // sort properly relative to everything else.
      (suite.children as Array<TestInfo>).sort((a: TestInfo, b: TestInfo) => {
        if ((a as TestInfo).type === "test" && (b as TestInfo).type === "test") {
          let aLocation: number = super.getTestLocation(a as TestInfo);
          let bLocation: number = super.getTestLocation(b as TestInfo);
          return aLocation - bLocation;
        } else {
          return 0;
        }
      })
    });

    this.testSuite = testSuite;

    return Promise.resolve<TestSuiteInfo>(testSuite);
  }

  /**
   * Get the user-configured RSpec command, if there is one.
   *
   * @return The RSpec command
   */
  protected getRspecCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
    return command || 'bundle exec rspec';
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The spec directory
   */
  getTestDirectory(): string {
    let directory: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('specDirectory') as string);
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
   * Convert a string from snake_case to PascalCase.
   * Note that the function will return the input string unchanged if it
   * includes a '/'.
   *
   * @param string The string to convert to PascalCase.
   * @return The converted string.
   */
  protected snakeToPascalCase(string: string): string {
    if (string.includes('/')) { return string }
    return string.split("_").map(substr => substr.charAt(0).toUpperCase() + substr.slice(1)).join("");
  }

  /**
   * Sorts an array of TestSuiteInfo objects by label.
   *
   * @param testSuiteChildren An array of TestSuiteInfo objects, generally the children of another TestSuiteInfo object.
   * @return The input array, sorted by label.
   */
  protected sortTestSuiteChildren(testSuiteChildren: Array<TestSuiteInfo>): Array<TestSuiteInfo> {
    testSuiteChildren = testSuiteChildren.sort((a: TestSuiteInfo, b: TestSuiteInfo) => {
      let comparison = 0;
      if (a.label > b.label) {
        comparison = 1;
      } else if (a.label < b.label) {
        comparison = -1;
      }
      return comparison;
    });

    return testSuiteChildren;
  }

  /**
   * Create the base test suite with a root node and one layer of child nodes
   * representing the subdirectories of spec/, and then any files under the
   * given subdirectory.
   *
   * @param tests Test objects returned by our custom RSpec formatter.
   * @return The test suite root with its children.
   */
  public async getBaseTestSuite(
    tests: any[]
  ): Promise<TestSuiteInfo> {
    let rootTestSuite: TestSuiteInfo = {
      type: 'suite',
      id: 'root',
      label: 'RSpec',
      children: []
    };

    // Create an array of all test files and then abuse Sets to make it unique.
    let uniqueFiles = [...new Set(tests.map((test: { file_path: string; }) => test.file_path))];

    let splitFilesArray: Array<string[]> = [];

    // Remove the spec/ directory from all the file path.
    uniqueFiles.forEach((file) => {
      splitFilesArray.push(file.replace(`${this.getTestDirectory()}`, "").split('/'));
    });

    // This gets the main types of tests, e.g. features, helpers, models, requests, etc.
    let subdirectories: Array<string> = [];
    splitFilesArray.forEach((splitFile) => {
      if (splitFile.length > 1) {
        subdirectories.push(splitFile[0]);
      }
    });
    subdirectories = [...new Set(subdirectories)];

    // A nested loop to iterate through the direct subdirectories of spec/ and then
    // organize the files under those subdirectories.
    subdirectories.forEach((directory) => {
      let filesInDirectory: Array<TestSuiteInfo> = [];

      let uniqueFilesInDirectory: Array<string> = uniqueFiles.filter((file) => {
        return file.startsWith(`${this.getTestDirectory()}${directory}/`);
      });

      // Get the sets of tests for each file in the current directory.
      uniqueFilesInDirectory.forEach((currentFile: string) => {
        let currentFileTestSuite = super.getTestSuiteForFile({ tests, currentFile, directory });
        filesInDirectory.push(currentFileTestSuite);
      });

      let directoryTestSuite: TestSuiteInfo = {
        type: 'suite',
        id: directory,
        label: directory,
        children: filesInDirectory
      };

      rootTestSuite.children.push(directoryTestSuite);
    });

    // Sort test suite types alphabetically.
    rootTestSuite.children = this.sortTestSuiteChildren(rootTestSuite.children as Array<TestSuiteInfo>);

    // Get files that are direct descendants of the spec/ directory.
    let topDirectoryFiles = uniqueFiles.filter((filePath) => {
      return filePath.replace(`${this.getTestDirectory()}`, "").split('/').length === 1;
    });

    topDirectoryFiles.forEach((currentFile) => {
      let currentFileTestSuite = super.getTestSuiteForFile({ tests, currentFile });
      rootTestSuite.children.push(currentFileTestSuite);
    });

    return rootTestSuite;
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

    let testCommand = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter ${testLocation}`;
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
    let testCommand = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter ${testFile}`;
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

    let testCommand = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter`;
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
      let errorMessage: string = test.exception.message;

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
        message: errorMessage
      });
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      this.testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'skipped', message: test.pending_message });
    }
  };
}
