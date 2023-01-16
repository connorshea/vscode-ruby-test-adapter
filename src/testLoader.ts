import * as vscode from 'vscode';
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger';
import { TestSuiteManager } from './testSuiteManager';
import { LoaderQueue } from './loaderQueue';

/**
 * Responsible for finding and watching test files, and loading tests from within those
 * files
 *
 * Defers to TestSuite for parsing test information
 */
export class TestLoader implements vscode.Disposable {
  protected disposables: { dispose(): void }[] = [];
  private readonly log: IChildLogger;
  private readonly cancellationTokenSource = new vscode.CancellationTokenSource()
  private readonly resolveQueue: LoaderQueue

  constructor(
    readonly rootLog: IChildLogger,
    private readonly resolveTestProfile: vscode.TestRunProfile,
    private readonly manager: TestSuiteManager,
  ) {
    this.log = rootLog.getChildLogger({ label: 'TestLoader' });
    this.resolveQueue = new LoaderQueue(rootLog, async (testItems?: vscode.TestItem[]) => await this.loadTests(testItems))
    this.disposables.push(this.cancellationTokenSource)
    this.disposables.push(this.resolveQueue)
    this.disposables.push(this.configWatcher());
  }

  dispose(): void {
    this.log.debug("Dispose called")
    for (const disposable of this.disposables) {
      try {
        disposable.dispose();
      } catch (err) {
        this.log.error("Error disposing object", disposable, err)
      }
    }
    this.disposables = [];
  }

  /**
   * Create a file watcher that will update the test item tree when:
   * - A test file is created
   * - A test file is changed
   * - A test file is deleted
   * @param pattern Glob pattern to use for the file watcher
   */
  createFileWatcher(pattern: vscode.GlobPattern): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.disposables.push(watcher)

    // When files are created, make sure there's a corresponding "file" node in the test item tree
    watcher.onDidCreate(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidCreate watcher'})
      watcherLog.debug('File created: %s', uri.fsPath)
      this.manager.getOrCreateTestItem(this.uriToTestId(uri))
    })
    // When files change, reload them
    watcher.onDidChange(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidChange watcher'})
      watcherLog.debug('File changed, reloading tests: %s', uri.fsPath)
      let testItem = this.manager.getTestItem(this.uriToTestId(uri))
      if (!testItem) {
        watcherLog.error('Unable to find test item for file', uri)
      } else {
        this.resolveQueue.enqueue(testItem)
      }
    });
    // And, finally, delete TestItems for removed files
    watcher.onDidDelete(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidDelete watcher'})
      watcherLog.debug('File deleted: %s', uri.fsPath)
      this.manager.deleteTestItem(this.uriToTestId(uri))
    });

    return watcher;
  }

  /**
   * Searches the configured test directory for test files, according to the configured glob patterns.
   *
   * For each pattern, a FileWatcher is created to notify the plugin of changes to files
   * For each file found, a request to load tests from that file is enqueued
   *
   * Waits for all test files to be loaded from the queue before returning
   */
  public async discoverAllFilesInWorkspace(): Promise<vscode.FileSystemWatcher[]> {
    let log = this.log.getChildLogger({ label: `${this.discoverAllFilesInWorkspace.name}` })
    let testDir = this.manager.config.getAbsoluteTestDirectory()

    let patterns: Array<vscode.GlobPattern> = []
    this.manager.config.getFilePattern().forEach(pattern => {
      patterns.push(new vscode.RelativePattern(testDir, '**/' + pattern))
    })

    log.debug('Setting up watchers with the following test patterns', patterns)
    let resolveFilesPromises: Promise<vscode.TestItem>[] = []
    let fileWatchers = await Promise.all(patterns.map(async (pattern) => {
      for (const file of await vscode.workspace.findFiles(pattern)) {
        log.debug('Found file, creating TestItem', file)
        this.manager.getOrCreateTestItem(this.uriToTestId(file))
      }

      // TODO - skip if filewatcher for this pattern exists and dispose filewatchers for patterns no longer in config
      let fileWatcher = this.createFileWatcher(pattern)
      return fileWatcher
    }))
    await Promise.all(resolveFilesPromises)
    return fileWatchers
  }

  /**
   * Runs the test runner using the 'ResolveTests' profile to load test information.
   *
   * Only called from the queue
   *
   * @param testItems Array of test items to be loaded. If undefined, all tests and files are loaded
   */
  private async loadTests(testItems?: vscode.TestItem[]): Promise<void> {
    let log = this.log.getChildLogger({label:'loadTests'})
    log.info('Loading tests...', { testIds: testItems?.map(x => x.id) || 'all tests' });
    try {
      if (testItems) { for (const item of testItems) { item.busy = true }}
      let request = new vscode.TestRunRequest(testItems, undefined, this.resolveTestProfile)
      await this.resolveTestProfile.runHandler(request, this.cancellationTokenSource.token)
    } catch (e: any) {
      log.error('Failed to load tests', e)
      return Promise.reject(e)
    } finally {
      if (testItems) { for (const item of testItems) { item.busy = false }}
    }
  }

  /**
   * Enqueues a single test item to be loaded
   * @param testItem the test item to be loaded
   * @returns the loaded test item
   */
  public async loadTestItem(testItem: vscode.TestItem): Promise<vscode.TestItem> {
    return await this.resolveQueue.enqueue(testItem)
  }

  private configWatcher(): vscode.Disposable {
    let log = this.rootLog.getChildLogger({ label: 'TestLoader.configWatcher' });
    log.debug('configWatcher')
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (this.configChangeAffectsFileWatchers(configChange)) {
        this.manager.controller.items.replace([])
        this.discoverAllFilesInWorkspace();
      }
    })
  }

  private configChangeAffectsFileWatchers(configChange: vscode.ConfigurationChangeEvent): boolean {
    return configChange.affectsConfiguration('rubyTestExplorer.filePattern')
      || configChange.affectsConfiguration('rubyTestExplorer.testFramework')
      || configChange.affectsConfiguration('rubyTestExplorer.rspecDirectory')
      || configChange.affectsConfiguration('rubyTestExplorer.minitestDirectory')
  }

  /**
   * Converts a test URI into a test ID
   * @param uri URI of test
   * @returns test ID
   */
  private uriToTestId(uri: string | vscode.Uri): string {
    let log = this.log.getChildLogger({label: 'uriToTestId'})
    if (typeof uri === "string") {
      log.debug("uri is string. Returning unchanged")
      return uri
    }
    let fullTestDirPath = this.manager.config.getAbsoluteTestDirectory()
    log.debug('Full path to test dir: %s', fullTestDirPath)
    let strippedUri = uri.fsPath.replace(fullTestDirPath + path.sep, '')
    log.debug('Stripped URI: %s', strippedUri)
    return strippedUri
  }
}
