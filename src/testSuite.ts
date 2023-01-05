import * as vscode from 'vscode'
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger';
import { Config } from './config';

/**
 * Manages the contents of the test suite
 *
 * Responsible for creating, deleting and finding test items
 */
export class TestSuite {
  private readonly log: IChildLogger;
  private readonly locationPattern = /\[[0-9]*(?::[0-9]*)*\]$/

  constructor(
    readonly rootLog: IChildLogger,
    private readonly controller: vscode.TestController,
    private readonly config: Config
  ) {
    this.log = rootLog.getChildLogger({label: "TestSuite"});
  }

  public deleteTestItem(testId: string | vscode.Uri) {
    let log = this.log.getChildLogger({label: 'deleteTestItem'})
    testId = this.uriToTestId(testId)
    log.debug(`Deleting test ${testId}`)
    let parent = this.getOrCreateParent(testId, false)
    let collection: vscode.TestItemCollection | undefined
    if (!parent) {
      log.debug('Parent is controller')
      collection = this.controller.items
    } else {
      log.debug(`Parent is ${parent.id}`)
      collection = parent.children
    }
    if (collection) {
      collection.delete(testId);
      log.debug(`Removed test ${testId}`)
    } else {
      log.error("Collection not found")
    }
  }

  /**
   * Get the {@link vscode.TestItem} for a test ID
   * @param testId Test ID to lookup
   * @returns The test item for the ID
   * @throws if test item could not be found
   */
  public getOrCreateTestItem(testId: string | vscode.Uri): vscode.TestItem {
    let log = this.log.getChildLogger({label: 'getOrCreateTestItem'})
    testId = this.uriToTestId(testId)
    if (testId.startsWith(`.${path.sep}`)) {
      testId = testId.substring(2)
    }
    log.debug(`Looking for test ${testId}`)
    let parent = this.getOrCreateParent(testId, true)
    let testItem = (parent?.children || this.controller.items).get(testId)
    if (!testItem) {
      // Create a basic test item with what little info we have to be filled in later
      let label = testId.substring(testId.lastIndexOf(path.sep) + 1)
      if (this.locationPattern.test(testId)) {
        label = this.getPlaceholderLabelForSingleTest(testId)
      }
      testItem = this.createTestItem(
        testId,
        label,
        parent,
        !this.locationPattern.test(testId)
      );
    }
    return testItem
  }

  /**
   * Gets a TestItem from the list of tests
   * @param testId ID of the TestItem to get
   * @returns TestItem if found, else undefined
   */
  public getTestItem(testId: string | vscode.Uri): vscode.TestItem | undefined {
    let log = this.log.getChildLogger({label: 'getTestItem'})
    testId = this.uriToTestId(testId)
    let parent = this.getOrCreateParent(testId, false)
    let testItem = (parent?.children || this.controller.items).get(testId)
    if (!testItem) {
      log.debug(`Couldn't find ${testId}`)
      return undefined
    }
    return testItem
  }

  public removeMissingTests(parsedTests: vscode.TestItem[], parent?: vscode.TestItem) {
    let log = this.log.getChildLogger({label: `${this.removeMissingTests.name}`})

    log.debug("Tests to check", parsedTests.length)
    while (parsedTests.length > 0) {
      let parent = parsedTests[0].parent
      log.debug("Checking parent", parent?.id)
      let parentCollection = parent ? parent.children : this.controller.items
      let parentCollectionSize = parentCollection.size
      parentCollection.replace(parsedTests.filter(x => x.parent == parent))
      log.debug("Removed tests from parent", parentCollectionSize - parentCollection.size)
      parsedTests = parsedTests.filter(x => x.parent != parent)
      log.debug("Remaining tests to check", parsedTests.length)
    }
  }

  /**
   * Takes a test ID from the test runner output and normalises it to a consistent format
   *
   * - Removes leading './' if present
   * - Removes leading test dir if present
   */
  public normaliseTestId(testId: string): string {
    let log = this.log.getChildLogger({label: `normaliseTestId(${testId})`})
    if (testId.startsWith(`.${path.sep}`)) {
      testId = testId.substring(2)
    }
    if (testId.startsWith(this.config.getRelativeTestDirectory())) {
      testId = testId.replace(this.config.getRelativeTestDirectory(), '')
    }
    if (testId.startsWith(path.sep)) {
      testId = testId.substring(1)
    }
    log.debug(`Normalised ID: ${testId}`)
    return testId
  }

  /**
   * Converts a test URI into a test ID
   * @param uri URI of test
   * @returns test ID
   */
  private uriToTestId(uri: string | vscode.Uri): string {
    let log = this.log.getChildLogger({label: `uriToTestId(${uri})`})
    if (typeof uri === "string") {
      log.debug("uri is string. Returning unchanged")
      return uri
    }
    let fullTestDirPath = this.config.getAbsoluteTestDirectory()
    log.debug(`Full path to test dir: ${fullTestDirPath}`)
    let strippedUri = uri.fsPath.replace(fullTestDirPath + path.sep, '')
    log.debug(`Stripped URI: ${strippedUri}`)
    return strippedUri
  }

  private testIdToUri(testId: string): vscode.Uri {
    return vscode.Uri.file(path.resolve(this.config.getAbsoluteTestDirectory(), testId.replace(/\[.*\]/, '')))
  }

  /**
   * Searches the collection of tests for the TestItemCollection that contains the given test ID
   * @param testId ID of the test to get the parent collection of
   * @param createIfMissing Create parent test collections if missing
   * @returns Parent collection of the given test ID
   */
  private getOrCreateParent(testId: string, createIfMissing: boolean): vscode.TestItem | undefined {
    let log = this.log.getChildLogger({label: `${this.getOrCreateParent.name}(${testId}, createIfMissing: ${createIfMissing})`})
    let idSegments = this.splitTestId(testId)
    let parent: vscode.TestItem | undefined

    // Walk through test folders to find the collection containing our test file
    for (let i = 0; i < idSegments.length - 1; i++) {
      let collectionId = this.getPartialId(idSegments, i)
      log.debug(`Getting parent collection ${collectionId}`)
      let child = this.controller.items.get(collectionId)
      if (!child) {
        if (!createIfMissing) return undefined
        child = this.createTestItem(
          collectionId,
          idSegments[i]
        )
      }
      parent = child
    }

    // TODO: This might not handle nested describe/context/etc blocks?
    if (this.locationPattern.test(testId)) {
      // Test item is a test within a file
      // Need to make sure we strip locations from file id to get final collection
      let fileId = testId.replace(this.locationPattern, '')
      if (fileId.startsWith(path.sep)) {
        fileId = fileId.substring(1)
      }
      let child = (parent?.children || this.controller.items).get(fileId)
      if (!child) {
        log.debug(`TestItem for file ${fileId} not in parent collection`)
        if (!createIfMissing) return undefined
        child = this.createTestItem(
          fileId,
          fileId.substring(fileId.lastIndexOf(path.sep) + 1),
          parent,
        )
      }
      log.debug(`Got TestItem for file ${fileId} from parent collection`)
      parent = child
    }
    // else test item is the file so return the file's parent
    return parent
  }

  /**
   * Creates a TestItem and adds it to a TestItemCollection
   * @param collection
   * @param testId
   * @param label
   * @param uri
   * @param canResolveChildren
   * @returns
   */
  private createTestItem(
    testId: string,
    label: string,
    parent?: vscode.TestItem,
    canResolveChildren: boolean = true
  ): vscode.TestItem {
    let log = this.log.getChildLogger({ label: `${this.createTestItem.name}(${testId})` })
    let uri = this.testIdToUri(testId)
    log.debug(`Creating test item - label: ${label}, parent: ${parent?.id}, canResolveChildren: ${canResolveChildren}, uri: ${uri},`)
    let item = this.controller.createTestItem(testId, label, uri)
    item.canResolveChildren = canResolveChildren;
    (parent?.children || this.controller.items).add(item);
    log.debug(`Added test ${item.id}`)
    return item
  }

  /**
   * Builds the testId of a parent folder from the parts of a child ID up to the given depth
   * @param idSegments array of segments of a test ID (e.g. ['foo', 'bar', 'bat.rb'] would be the segments for the test item 'foo/bar/bat.rb')
   * @param depth number of segments to use to build the ID
   * @returns test ID of a parent folder
   */
  private getPartialId(idSegments: string[], depth: number): string {
    return (depth == 0)
      ? idSegments[0]
      : idSegments.slice(0, depth + 1).join(path.sep)
  }

  /**
   * Splits a test ID into segments by path separator
   * @param testId
   * @returns
   */
  private splitTestId(testId: string): string[] {
    let log = this.log.getChildLogger({label: `splitTestId(${testId})`})
    testId = this.normaliseTestId(testId)
    let idSegments = testId.split(path.sep)
    log.debug('id segments', idSegments)
    if (idSegments[0] === "") {
      idSegments.splice(0, 1)
    }
    return idSegments
  }

  private getPlaceholderLabelForSingleTest(testId: string): string {
    return `Awaiting test details... (location: ${this.locationPattern.exec(testId)})`
  }
}
