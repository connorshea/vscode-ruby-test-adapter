import * as vscode from 'vscode';
import * as path from 'path';
import { IChildLogger } from '@vscode-logging/logger';
import { TestRunner } from './testRunner';
import { RspecTestRunner } from './rspec/rspecTestRunner';
import { MinitestTestRunner } from './minitest/minitestTestRunner';
import { Config } from './config';
import { TestSuite } from './testSuite';

export type ParsedTest = {
  id: string,
  full_description: string,
  description: string,
  file_path: string,
  line_number: number,
  location?: number,
  status?: string,
  pending_message?: string | null,
  exception?: any,
  type?: any, // what is this?
}

/**
 * Responsible for finding and watching test files, and loading tests from within those
 * files
 *
 * Defers to TestSuite for parsing test information
 */
export class TestLoader implements vscode.Disposable {
  protected disposables: { dispose(): void }[] = [];
  private readonly log: IChildLogger;

  constructor(
    readonly rootLog: IChildLogger,
    private readonly workspace: vscode.WorkspaceFolder | undefined,
    private readonly controller: vscode.TestController,
    private readonly testRunner: RspecTestRunner | MinitestTestRunner,
    private readonly config: Config,
    private readonly testSuite: TestSuite,
  ) {
    this.log = rootLog.getChildLogger({ label: "TestLoader" });
    this.log.debug('constructor')
    this.disposables.push(this.configWatcher());
    this.log.debug('constructor complete')
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Create a file watcher that will update the test tree when:
   * - A test file is created
   * - A test file is changed
   * - A test file is deleted
   */
  async createWatcher(pattern: vscode.GlobPattern): Promise<vscode.FileSystemWatcher> {
    let log = this.log.getChildLogger({label: `createWatcher(${pattern})`})
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // When files are created, make sure there's a corresponding "file" node in the tree
    watcher.onDidCreate(uri => {
      log.debug(`onDidCreate ${uri.fsPath}`)
      this.testSuite.getOrCreateTestItem(uri)
    })
    // When files change, re-parse them. Note that you could optimize this so
    // that you only re-parse children that have been resolved in the past.
    watcher.onDidChange(uri => {
      log.debug(`onDidChange ${uri.fsPath}`)
      this.parseTestsInFile(uri)
    });
    // And, finally, delete TestItems for removed files. This is simple, since
    // we use the URI as the TestItem's ID.
    watcher.onDidDelete(uri => {
      log.debug(`onDidDelete ${uri.fsPath}`)
      this.testSuite.deleteTestItem(uri)
    });

    for (const file of await vscode.workspace.findFiles(pattern)) {
      this.testSuite.getOrCreateTestItem(file);
    }

    return watcher;
  }

  /**
   * Searches the configured test directory for test files, and calls createWatcher for
   * each one found.
   */
  discoverAllFilesInWorkspace() {
    let log = this.log.getChildLogger({ label: `${this.discoverAllFilesInWorkspace.name}` })
    let testDir = path.resolve(this.workspace?.uri.fsPath ?? '.', this.config.getTestDirectory())
    log.debug(`testDir: ${testDir}`)

    let patterns: Array<vscode.GlobPattern> = []
    this.config.getFilePattern().forEach(pattern => {
      // TODO: Search all workspace folders (needs ability to exclude folders)
      // if (vscode.workspace.workspaceFolders) {
      //   vscode.workspace.workspaceFolders!.forEach(async (workspaceFolder) => {
      //     patterns.push(new vscode.RelativePattern(workspaceFolder, '**/' + pattern))
      //   })
      // }
      patterns.push(new vscode.RelativePattern(testDir, '**/' + pattern))
    })

    log.debug("Setting up watchers with the following test patterns", patterns)
    return Promise.all(patterns.map(async (pattern) => await this.createWatcher(pattern)))
      .then()
      .catch(err => { log.error(err) })
  }

  /**
   * Takes the output from initTests() and parses the resulting
   * JSON into a TestSuiteInfo object.
   *
   * @return The full test suite.
   */
  public async loadTests(testItem: vscode.TestItem): Promise<void> {
    let log = this.log.getChildLogger({label:"loadTests"})
    log.info(`Loading tests for ${testItem.id} (${this.config.frameworkName()})...`);
    try {
      let output = await this.testRunner.initTests([testItem]);

      log.debug(`Passing raw output from dry-run into getJsonFromOutput: ${output}`);
      output = TestRunner.getJsonFromOutput(output);
      log.debug(`Parsing the returned JSON: ${output}`);
      let testMetadata;
      try {
        testMetadata = JSON.parse(output);
      } catch (error) {
        log.error('JSON parsing failed', error);
      }

      let tests = TestLoader.parseDryRunOutput(
        this.log,
        this.testSuite,
        testMetadata.examples
      )

      log.debug("Test output parsed. Adding tests to test suite", tests)
      this.getTestSuiteForFile(tests, testItem);
    } catch (e: any) {
      log.error("Failed to load tests", e)
      return Promise.reject(e)
    }
  }

  public static parseDryRunOutput(
    rootLog: IChildLogger,
    testSuite: TestSuite,
    tests: ParsedTest[]
  ): ParsedTest[] {
    let log = rootLog.getChildLogger({ label: "parseDryRunOutput" })
    log.debug(`called with ${tests.length} items`)
    let parsedTests: Array<ParsedTest> = [];

    tests.forEach(
      (test: ParsedTest) => {
        log.debug("Parsing test", test)
        let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
        let test_location_string: string = test_location_array.join('');
        let location = parseInt(test_location_string); // TODO: check this isn't RSpec specific
        let id = testSuite.normaliseTestId(test.id)
        let file_path = TestLoader.normaliseFilePath(testSuite, test.file_path)
        let parsedTest = {
          ...test,
          id: id,
          file_path: file_path,
          location: location,
        }
        parsedTests.push(parsedTest);
        log.debug("Parsed test", parsedTest)
      }
    );
    return parsedTests
  }

  public static normaliseFilePath(testSuite: TestSuite, filePath: string): string {
    filePath = testSuite.normaliseTestId(filePath)
    return filePath.replace(/\[.*/, '')
  }

  /**
   * Get the tests in a given file.
   *
   * @param tests Parsed output from framework
   * @param testItem TestItem object containing file details
   */
  public getTestSuiteForFile(tests: Array<ParsedTest>, testItem: vscode.TestItem) {
    let log = this.log.getChildLogger({ label: `getTestSuiteForFile(${testItem.id})` })

    let currentFileSplitName = testItem.uri?.fsPath.split(path.sep);
    let currentFileLabel = currentFileSplitName ? currentFileSplitName[currentFileSplitName!.length - 1] : testItem.label
    log.debug(`Current file label: ${currentFileLabel}`)

    let pascalCurrentFileLabel = this.snakeToPascalCase(currentFileLabel.replace('_spec.rb', ''));

    tests.forEach((test) => {
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

      let childTestItem = this.testSuite.getOrCreateTestItem(test.id)
      childTestItem.canResolveChildren = false
      childTestItem.label = description
      childTestItem.range = new vscode.Range(test.line_number - 1, 0, test.line_number, 0);

      testItem.children.add(childTestItem);
    });
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


  public async parseTestsInFile(uri: vscode.Uri | vscode.TestItem) {
    let log = this.log.getChildLogger({label: "parseTestsInFile"})
    let testItem: vscode.TestItem
    if ("fsPath" in uri) {
      let test = this.testSuite.getTestItem(uri)
      if (!test) {
        return
      }
      testItem = test
    } else {
      testItem = uri
    }

    log.info(`${testItem.id} has been edited, reloading tests.`);
    await this.loadTests(testItem)
  }

  private configWatcher(): vscode.Disposable {
    let log = this.rootLog.getChildLogger({ label: "TestLoader.configWatcher" });
    log.debug('configWatcher')
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration("rubyTestExplorer")) {
        this.controller.items.replace([])
        this.discoverAllFilesInWorkspace();
      }
    })
  }
}
