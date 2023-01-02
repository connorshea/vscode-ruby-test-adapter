import * as vscode from 'vscode';
import { IChildLogger } from '@vscode-logging/logger';
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
  type?: any,
  full_path?: string, // Minitest
  klass?: string, // Minitest
  method?: string, // Minitest
  runnable?: string, // Minitest
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
    private readonly controller: vscode.TestController,
    private readonly testRunner: RspecTestRunner | MinitestTestRunner,
    private readonly config: Config,
    private readonly testSuite: TestSuite,
  ) {
    this.log = rootLog.getChildLogger({ label: "TestLoader" });
    this.disposables.push(this.configWatcher());
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

    let testFiles = []
    for (const file of await vscode.workspace.findFiles(pattern)) {
      testFiles.push(this.testSuite.getOrCreateTestItem(file))
    }
    await this.loadTests(testFiles)

    return watcher;
  }

  /**
   * Searches the configured test directory for test files, and calls createWatcher for
   * each one found.
   */
  public async discoverAllFilesInWorkspace(): Promise<vscode.FileSystemWatcher[]> {
    let log = this.log.getChildLogger({ label: `${this.discoverAllFilesInWorkspace.name}` })
    let testDir = this.config.getAbsoluteTestDirectory()
    log.debug(`testDir: ${testDir}`)

    let patterns: Array<vscode.GlobPattern> = []
    this.config.getFilePattern().forEach(pattern => {
      patterns.push(new vscode.RelativePattern(testDir, '**/' + pattern))
    })

    log.debug("Setting up watchers with the following test patterns", patterns)
    return Promise.all(patterns.map(async (pattern) => await this.createWatcher(pattern)))
  }

  /**
   * Takes the output from initTests() and parses the resulting
   * JSON into a TestSuiteInfo object.
   *
   * @return The full test suite.
   */
  public async loadTests(testItems: vscode.TestItem[]): Promise<void> {
    let log = this.log.getChildLogger({label:"loadTests"})
    log.info(`Loading tests for ${testItems.length} items (${this.config.frameworkName()})...`);
    try {
      let output = await this.testRunner.initTests(testItems);

      log.debug(`Passing raw output from dry-run into getJsonFromOutput: ${output}`);
      this.testRunner.parseAndHandleTestOutput(output)
    } catch (e: any) {
      log.error("Failed to load tests", e)
      return Promise.reject(e)
    }
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
    await this.loadTests([testItem])
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
