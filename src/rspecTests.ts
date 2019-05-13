import * as vscode from 'vscode';
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import * as childProcess from 'child_process';

export class RspecTests {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Representation of the RSpec test suite as a TestSuiteInfo object.
   * 
   * @return The RSpec test suite as a TestSuiteInfo object.
   */
  rspecTests = async () => new Promise<TestSuiteInfo>((resolve, reject) => {
    try {
      let rspecTests = this.loadRspecTests();
      return resolve(rspecTests);
    } catch(err) {
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

    const execArgs: childProcess.ExecOptions = {
      cwd: vscode.workspace.rootPath,
      maxBuffer: 400 * 1024
    };

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      if (err) {
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
  public async loadRspecTests(): Promise<TestSuiteInfo> {
    let output = await this.initRspecTests();
    output = this.getJsonFromRspecOutput(output);
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
          let aLocation: number = this.getTestLocation(a as TestInfo);
          let bLocation: number = this.getTestLocation(b as TestInfo);
          return aLocation - bLocation;
        } else {
          return 0;
        }
      })
    });

    return Promise.resolve<TestSuiteInfo>(testSuite);
  }

  /**
   * Pull JSON out of the RSpec output.
   * 
   * RSpec frequently returns bad data even when it's told to format the output
   * as JSON, e.g. due to code coverage messages and other injections from gems.
   * This tries to get the JSON by stripping everything before the first opening
   * brace and after the last closing brace. It's probably not perfect, but it's
   * worked for everything I've tried so far.
   * 
   * @param output The output returned by running an RSpec command
   * @return A string representation of the JSON found in the RSpec output.
   */
  private getJsonFromRspecOutput(output: string): string {
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
  private getTestLocation(test: TestInfo): number {
    return parseInt(test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':').join(''));
  }

  /**
   * Get the user-configured RSpec command, if there is one.
   *
   * @return The RSpec command
   */
  private getRspecCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
    return command || 'bundle exec rspec';
  }

  /**
   * Get the user-configured spec directory, if there is one.
   *
   * @return The spec directory
   */
  private getSpecDirectory(): string {
    let directory: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('specDirectory') as string);
    return directory || './spec/';
  }

  /**
   * Get the absolute path of the custom_formatter.rb file.
   *
   * @return The spec directory
   */
  private getCustomFormatterLocation(): string {
    return this.context.asAbsolutePath('./src/custom_formatter.rb');
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

  /**
   * Sorts an array of TestSuiteInfo objects by label.
   * 
   * @param testSuiteChildren An array of TestSuiteInfo objects, generally the children of another TestSuiteInfo object.
   * @return The input array, sorted by label.
   */
  private sortTestSuiteChildren(testSuiteChildren: Array<TestSuiteInfo>): Array<TestSuiteInfo> {
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

  // Get the tests in a given file.
  public getTestSuiteForFile(
  { tests, currentFile, directory }: {
  tests: Array<{
    id: string;
    full_description: string;
    description: string;
    file_path: string;
    line_number: number;
    location: number;
  }>; currentFile: string; directory?: string;
  }): TestSuiteInfo {
    let currentFileTests = tests.filter(test => {
      return test.file_path === currentFile
    });

    let currentFileTestsInfo = currentFileTests as unknown as Array<TestInfo>;
    currentFileTestsInfo.forEach((test: TestInfo) => {
      test.type = 'test';
      test.label = '';
    });

    let currentFileLabel = '';

    if (directory) {
      currentFileLabel = currentFile.replace(`${this.getSpecDirectory()}${directory}/`, '');
    } else {
      currentFileLabel = currentFile.replace(`${this.getSpecDirectory()}`, '');
    }

    let pascalCurrentFileLabel = this.snakeToPascalCase(currentFileLabel.replace('_spec.rb', ''));

    let currentFileTestInfoArray: Array<TestInfo> = currentFileTests.map((test) => {
      // Concatenation of "/Users/username/whatever/project_dir" and "./spec/path/here.rb",
      // but with the latter's first character stripped.
      let filePath: string = `${vscode.workspace.rootPath}${test.file_path.substr(1)}`;

      // RSpec provides test ids like "file_name.rb[1:2:3]".
      // This uses the digits at the end of the id to create
      // an array of numbers representing the location of the
      // test in the file.
      let testLocationArray: Array<number> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':').map((x) => {
        return parseInt(x);
      });

      // Get the last element in the location array.
      let testNumber: number = testLocationArray[testLocationArray.length - 1];
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

      let testInfo: TestInfo = {
        type: 'test',
        id: test.id,
        label: description,
        file: filePath,
        // Line numbers are 0-indexed
        line: test.line_number - 1
      }

      return testInfo;
    });

    let currentFileTestSuite: TestSuiteInfo = {
      type: 'suite',
      id: currentFile,
      label: currentFileLabel,
      children: currentFileTestInfoArray
    }

    return currentFileTestSuite;
  }

  /**
   * Create the base test suite with a root node and one layer of child nodes
   * representing the subdirectories of spec/, and then any files under the
   * given subdirectory.
   * 
   * @param tests Test objects returned by RSpec's JSON formatter.
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

    let uniqueFiles = [...new Set(tests.map((test: { file_path: string; }) => test.file_path))];

    let splitFilesArray: Array<string[]> = [];

    // Remove the spec/ directory from all the file path.
    uniqueFiles.forEach((file) => {
      splitFilesArray.push(file.replace(`${this.getSpecDirectory()}`, "").split('/'));
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
        return file.startsWith(`${this.getSpecDirectory()}${directory}/`);
      });

      // Get the sets of tests for each file in the current directory.
      uniqueFilesInDirectory.forEach((currentFile: string) => {
        let currentFileTestSuite = this.getTestSuiteForFile({ tests, currentFile, directory });
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
      return filePath.replace(`${this.getSpecDirectory()}`, "").split('/').length === 1;
    });

    topDirectoryFiles.forEach((currentFile) => {
      let currentFileTestSuite = this.getTestSuiteForFile({ tests, currentFile });
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
  runSingleTest = async (testLocation: string | undefined) => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter ${testLocation !== undefined ? testLocation : ''}`;

    const execArgs: childProcess.ExecOptions = {
      cwd: vscode.workspace.rootPath,
      maxBuffer: 400 * 1024
    };

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      resolve(stdout);
    });
  });

  /**
   * Runs the full test suite for the current workspace.
   * 
   * @return The raw output from running the test suite.
   */
  runFullTestSuite = async () => new Promise<string>((resolve, reject) => {
    let cmd = `${this.getRspecCommand()} --require ${this.getCustomFormatterLocation()} --format CustomFormatter`;

    const execArgs: childProcess.ExecOptions = {
      cwd: vscode.workspace.rootPath,
      maxBuffer: 400 * 1024
    };

    childProcess.exec(cmd, execArgs, (err, stdout) => {
      resolve(stdout);
    });
  });

  /**
   * Runs the test suite by iterating through each test and running it.
   * 
   * @param tests 
   * @param testStatesEmitter 
   */
  runRspecTests = async (
    tests: string[],
    testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
  ): Promise<void> => {
    let testSuite: TestSuiteInfo = await this.rspecTests();

    for (const suiteOrTestId of tests) {
      const node = this.findNode(testSuite, suiteOrTestId);
      if (node) {
        await this.runNode(node, testStatesEmitter);
      }
    }
  }

  /**
   * 
   * @param searchNode The test or test suite to search in.
   * @param id The id of the test or test suite.
   */
  private findNode(searchNode: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
    if (searchNode.id === id) {
      return searchNode;
    } else if (searchNode.type === 'suite') {
      for (const child of searchNode.children) {
        const found = this.findNode(child, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * 
   * @param node A test or test suite.
   * @param testStatesEmitter An emitter for the test suite's state.
   */
  private async runNode(
    node: TestSuiteInfo | TestInfo,
    testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
  ): Promise<void> {

    // Special case handling for the root suite, since it can be run
    // with runFullTestSuite()
    if (node.type === 'suite' && node.id === 'root') {
      testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });
      
      let testOutput = await this.runFullTestSuite();
      testOutput = this.getJsonFromRspecOutput(testOutput);
      let testMetadata = JSON.parse(testOutput);
      let tests = testMetadata.examples;

      tests.forEach((test: { id: string | TestInfo; }) => {
        this.handleStatus(test, testStatesEmitter);
      });

      testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });
    } else if (node.type === 'suite') {

      testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'running' });

      for (const child of node.children) {
        await this.runNode(child, testStatesEmitter);
      }

      testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

    } else if (node.type === 'test') {
      if (node.file !== undefined && node.line !== undefined) {
        testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });
        
        // Run the test at the given line, add one since the line is 0-indexed in
        // VS Code and 1-indexed for RSpec.
        let testOutput = await this.runSingleTest(`${node.file}:${node.line + 1}`);

        testOutput = this.getJsonFromRspecOutput(testOutput);
        let testMetadata = JSON.parse(testOutput);
        let currentTest = testMetadata.examples[0];

        this.handleStatus(currentTest, testStatesEmitter);
      }
    }
  }

  /**
   * Handles test state based on the output returned by RSpec's JSON formatter.
   * 
   * @param test The test that we want to handle.
   * @param testStatesEmitter An emitter for the test suite's state.
   */
  private handleStatus(test: any, testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>): void {
    if (test.status === "passed") {
      testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'passed' });
    } else if (test.status === "failed" && test.pending_message === null) {
      let errorMessage: string = test.exception.message;

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
      }

      testStatesEmitter.fire(<TestEvent>{
        type: 'test',
        test: test.id,
        state: 'failed',
        message: errorMessage
      });
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      testStatesEmitter.fire(<TestEvent>{ type: 'test', test: test.id, state: 'skipped', message: test.pending_message });
    }
  };
}
