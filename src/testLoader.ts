import * as vscode from 'vscode';
import * as path from 'path';
import { IChildLogger } from '@vscode-logging/logger';
import { TestRunner } from './testRunner';
import { RspecTestRunner } from './rspec/rspecTestRunner';
import { MinitestTestRunner } from './minitest/minitestTestRunner';
import { Config } from './config';

export type ParsedTest = {
  id: string,
  full_description: string,
  description: string,
  file_path: string,
  line_number: number,
  location: number
}
export class TestLoader implements vscode.Disposable {
  protected disposables: { dispose(): void }[] = [];
  private readonly log: IChildLogger;

  constructor(
    readonly rootLog: IChildLogger,
    private readonly workspace: vscode.WorkspaceFolder | undefined,
    private readonly controller: vscode.TestController,
    private readonly testRunner: RspecTestRunner | MinitestTestRunner,
    private readonly config: Config
  ) {
    this.log = rootLog.getChildLogger({label: "TestLoader"});
    this.disposables.push(this.createWatcher());
    this.disposables.push(this.configWatcher());
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Takes the output from initTests() and parses the resulting
   * JSON into a TestSuiteInfo object.
   *
   * @return The full test suite.
   */
  public async loadAllTests(): Promise<void> {
    let log = this.log.getChildLogger({label:"loadAddTests"})
    log.info(`Loading Ruby tests (${this.config.frameworkName()})...`);
    try {
      let output = await this.testRunner.initTests();

      log.debug(`Passing raw output from dry-run into getJsonFromOutput: ${output}`);
      output = TestRunner.getJsonFromOutput(output);
      log.debug(`Parsing the returnd JSON: ${output}`);
      let testMetadata;
      try {
        testMetadata = JSON.parse(output);
      } catch (error) {
        log.error('JSON parsing failed', error);
      }

      let tests: Array<ParsedTest> = [];

      testMetadata.examples.forEach(
        (test: ParsedTest) => {
          let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
          let test_location_string: string = test_location_array.join('');
          test.location = parseInt(test_location_string);
          test.id = test.id.replace(this.config.getTestDirectory(), '')
          test.file_path = test.file_path.replace(this.config.getTestDirectory(), '')
          tests.push(test);
          log.debug("Parsed test", test)
        }
      );

      log.debug("Test output parsed. Building test suite", tests)
      let testSuite: vscode.TestItem[] = await this.getBaseTestSuite(tests);

      // // Sort the children of each test suite based on their location in the test tree.
      // testSuite.forEach((suite: vscode.TestItem) => {
      //   // NOTE: This will only sort correctly if everything is nested at the same
      //   // level, e.g. 111, 112, 121, etc. Once a fourth level of indentation is
      //   // introduced, the location is generated as e.g. 1231, which won't
      //   // sort properly relative to everything else.
      //   (suite.children as Array<TestInfo>).sort((a: TestInfo, b: TestInfo) => {
      //     if ((a as TestInfo).type === "test" && (b as TestInfo).type === "test") {
      //       let aLocation: number = this.getTestLocation(a as TestInfo);
      //       let bLocation: number = this.getTestLocation(b as TestInfo);
      //       return aLocation - bLocation;
      //     } else {
      //       return 0;
      //     }
      //   })
      // });

      this.controller.items.replace(testSuite);
    } catch (e: any) {
      log.error("Failed to load tests", e)
      return
    }
  }

  /**
   * Get the test directory based on the configuration value if there's a configured test framework.
   */
  private getTestDirectory(): string | undefined {
    let testDirectory = this.config.getTestDirectory();

    if (testDirectory === '' || !this.workspace) {
      return undefined;
    }

    if (testDirectory.startsWith("./")) {
      testDirectory = testDirectory.substring(2)
    }

    return path.join(this.workspace.uri.fsPath, testDirectory);
  }

  /**
   * Create the base test suite with a root node and one layer of child nodes
   * representing the subdirectories of spec/, and then any files under the
   * given subdirectory.
   *
   * @param tests Test objects returned by our custom RSpec formatter or Minitest Rake task.
   * @return The test suite root with its children.
   */
  private async getBaseTestSuite(tests: ParsedTest[]): Promise<vscode.TestItem[]> {
    let log = this.log.getChildLogger({ label: "getBaseTestSuite" })
    let testSuite: vscode.TestItem[] = []
    let testCount = 0
    let dirPath = this.getTestDirectory() ?? '.'

    // Create an array of all test files and then abuse Sets to make it unique.
    let uniqueFiles = [...new Set(tests.map((test: { file_path: string; }) => test.file_path))];

    let splitFilesArray: Array<string[]> = [];

    log.debug("Building base test suite from files", uniqueFiles)

    // Remove the spec/ directory from all the file path.
    uniqueFiles.forEach((file) => {
      if (file.startsWith('.')) {
        file = file.substring(1)
      }
      if (file.startsWith(path.sep)) {
        file = file.substring(1)
      }
      splitFilesArray.push(file.split('/'));
    });

    // This gets the main types of tests, e.g. features, helpers, models, requests, etc.
    let subdirectories: Array<string> = [];
    splitFilesArray.forEach((splitFile) => {
      if (splitFile.length > 1) {
        subdirectories.push(splitFile[0]);
      }
    });
    if (subdirectories[0] === ".") {
      subdirectories = subdirectories.slice(1)
    }
    subdirectories = [...new Set(subdirectories)];
    log.debug("Found subdirectories:", subdirectories)

    // A nested loop to iterate through the direct subdirectories of spec/ and then
    // organize the files under those subdirectories.
    subdirectories.forEach((directory) => {
      let subDirPath = path.join(dirPath, directory)
      let uniqueFilesInDirectory: Array<string> = uniqueFiles.filter((file) => {
        let fullFilePath = path.resolve(dirPath, file)
        log.debug(`Checking to see if ${fullFilePath} is in dir ${subDirPath}`)
        return subDirPath === fullFilePath.substring(0, fullFilePath.lastIndexOf(path.sep))
      });
      log.debug(`Files in subdirectory (${directory}):`, uniqueFilesInDirectory)

      let directoryTestSuite: vscode.TestItem = this.controller.createTestItem(directory, directory, vscode.Uri.file(subDirPath));
      //directoryTestSuite.description = directory

      // Get the sets of tests for each file in the current directory.
      uniqueFilesInDirectory.forEach((currentFile: string) => {
        let currentFileTestSuite = this.getTestSuiteForFile(tests, currentFile, dirPath);
        directoryTestSuite.children.add(currentFileTestSuite);
        testCount += currentFileTestSuite.children.size + 1
      });

      testSuite.push(directoryTestSuite);
      testCount++
    });

    // Sort test suite types alphabetically.
    //testSuite = this.sortTestSuiteChildren(testSuite);

    // Get files that are direct descendants of the spec/ directory.
    let topDirectoryFiles = uniqueFiles.filter((filePath) => {
      return filePath.split('/').length === 1;
    });
    log.debug(`Files in top directory:`, topDirectoryFiles)

    topDirectoryFiles.forEach((currentFile) => {
      let currentFileTestSuite = this.getTestSuiteForFile(tests, currentFile, dirPath);
      testSuite.push(currentFileTestSuite);
      testCount += currentFileTestSuite.children.size + 1
    });

    log.debug(`Returning ${testCount} test cases`)
    return testSuite;
  }

  /**
   * Get the tests in a given file.
   *
   * @param tests Parsed output from framework
   * @param currentFile Name of the file we're checking for tests
   * @param dirPath Full path to the root test folder
   */
  public getTestSuiteForFile(tests: Array<ParsedTest>, currentFile: string, dirPath: string): vscode.TestItem {
    let log = this.log.getChildLogger({ label: `getTestSuiteForFile(${currentFile})` })
    let currentFileTests = tests.filter(test => {
      return test.file_path === currentFile
    });

    let currentFileSplitName = currentFile.split(path.sep);
    let currentFileLabel = currentFileSplitName[currentFileSplitName.length - 1]

    let pascalCurrentFileLabel = this.snakeToPascalCase(currentFileLabel.replace('_spec.rb', ''));

    let testDir = this.getTestDirectory()
    if (!testDir) {
      log.fatal("No test folder configured or workspace folder open")
      throw new Error("Missing test folders")
    }
    let currentFileAsAbsolutePath = path.resolve(dirPath, currentFile);

    let currentFileTestSuite: vscode.TestItem = this.controller.createTestItem(
      currentFile,
      currentFileLabel,
      vscode.Uri.file(currentFileAsAbsolutePath)
    );

    currentFileTests.forEach((test) => {
      log.debug(`Building test: ${test.id}`)
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

      let testItem = this.controller.createTestItem(test.id, description, vscode.Uri.file(currentFileAsAbsolutePath));
      testItem.range = new vscode.Range(test.line_number - 1, 0, test.line_number, 0);

      currentFileTestSuite.children.add(testItem);
    });

    return currentFileTestSuite;
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
   * Create a file watcher that will reload the test tree when a relevant file is changed.
   */
  private createWatcher(): vscode.Disposable {
    return vscode.workspace.onDidSaveTextDocument(document => {
      if (!this.workspace)
        return

      const filename = document.uri.fsPath;
      this.log.info(`${filename} was saved - checking if this affects ${this.workspace.uri.fsPath}`);
      if (filename.startsWith(this.workspace.uri.fsPath)) {
        let testDirectory = this.getTestDirectory();

        // In the case that there's no configured test directory, we shouldn't try to reload the tests.
        if (testDirectory !== undefined && filename.startsWith(testDirectory)) {
          this.log.info('A test file has been edited, reloading tests.');

          // TODO: Reload only single file
          this.loadAllTests();
        }
      }
    })
  }

  private configWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        this.loadAllTests();
      }
    })
  }
}
