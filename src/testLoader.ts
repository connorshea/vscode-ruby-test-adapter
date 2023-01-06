import * as vscode from 'vscode';
import { IChildLogger } from '@vscode-logging/logger';
import { TestSuiteManager } from './testSuiteManager';

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
  private readonly cancellationTokenSource = new vscode.CancellationTokenSource()

  constructor(
    readonly rootLog: IChildLogger,
    private readonly resolveTestProfile: vscode.TestRunProfile,
    private readonly manager: TestSuiteManager,
  ) {
    this.log = rootLog.getChildLogger({ label: 'TestLoader' });
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
    let log = this.log.getChildLogger({label: `createWatcher(${pattern.toString()})`})
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // When files are created, make sure there's a corresponding "file" node in the tree
    watcher.onDidCreate(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidCreate watcher'})
      watcherLog.debug('File created', uri.fsPath)
      this.manager.getOrCreateTestItem(uri)
    })
    // When files change, re-parse them. Note that you could optimize this so
    // that you only re-parse children that have been resolved in the past.
    watcher.onDidChange(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidChange watcher'})
      watcherLog.debug('File changed', uri.fsPath)
      // TODO: batch these up somehow, else we'll spawn a ton of processes when, for
      // example, changing branches in git
      this.parseTestsInFile(uri)
    });
    // And, finally, delete TestItems for removed files. This is simple, since
    // we use the URI as the TestItem's ID.
    watcher.onDidDelete(uri => {
      let watcherLog = this.log.getChildLogger({label: 'onDidDelete watcher'})
      watcherLog.debug('File deleted', uri.fsPath)
      this.manager.deleteTestItem(uri)
    });

    for (const file of await vscode.workspace.findFiles(pattern)) {
      log.debug('Found file, creating TestItem', file)
      this.manager.getOrCreateTestItem(file)
    }

    log.debug('Resolving tests in found files')
    await this.loadTests()

    return watcher;
  }

  /**
   * Searches the configured test directory for test files, and calls createWatcher for
   * each one found.
   */
  public async discoverAllFilesInWorkspace(): Promise<vscode.FileSystemWatcher[]> {
    let log = this.log.getChildLogger({ label: `${this.discoverAllFilesInWorkspace.name}` })
    let testDir = this.manager.config.getAbsoluteTestDirectory()

    let patterns: Array<vscode.GlobPattern> = []
    this.manager.config.getFilePattern().forEach(pattern => {
      patterns.push(new vscode.RelativePattern(testDir, '**/' + pattern))
    })

    log.debug('Setting up watchers with the following test patterns', patterns)
    return Promise.all(patterns.map(async (pattern) => await this.createWatcher(pattern)))
  }

  /**
   * Takes the output from initTests() and parses the resulting
   * JSON into a TestSuiteInfo object.
   *
   * @return The full test suite.
   */
  public async loadTests(testItems?: vscode.TestItem[]): Promise<void> {
    let log = this.log.getChildLogger({label:'loadTests'})
    log.info('Loading tests...', testItems?.map(x => x.id) || 'all tests');
    try {
      let request = new vscode.TestRunRequest(testItems, undefined, this.resolveTestProfile)
      await this.resolveTestProfile.runHandler(request, this.cancellationTokenSource.token)
    } catch (e: any) {
      log.error('Failed to load tests', e)
      return Promise.reject(e)
    }
  }

  public async parseTestsInFile(uri: vscode.Uri | vscode.TestItem) {
    let log = this.log.getChildLogger({label: 'parseTestsInFile'})
    let testItem: vscode.TestItem
    if ('fsPath' in uri) {
      let test = this.manager.getTestItem(uri)
      if (!test) {
        return
      }
      testItem = test
    } else {
      testItem = uri
    }

    log.info('Test item has been changed, reloading tests.', testItem.id);
    await this.loadTests([testItem])
  }

  private configWatcher(): vscode.Disposable {
    let log = this.rootLog.getChildLogger({ label: 'TestLoader.configWatcher' });
    log.debug('configWatcher')
    return vscode.workspace.onDidChangeConfiguration(configChange => {
      this.log.info('Configuration changed');
      if (configChange.affectsConfiguration('rubyTestExplorer')) {
        this.manager.controller.items.replace([])
        this.discoverAllFilesInWorkspace();
      }
    })
  }
}
