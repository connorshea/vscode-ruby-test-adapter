import * as vscode from 'vscode'
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger';
import { Config } from './config';

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
    let collection = this.getParentTestItemCollection(testId)
    let testItem = collection.get(testId)
    if (testItem) {
      collection.delete(testItem.id);
      log.debug(`Removed test ${testItem.id}`)
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
    let collection = this.getOrCreateParentTestItemCollection(testId)
    let testItem = collection.get(testId)
    if (!testItem) {
      // Create a basic test item with what little info we have to be filled in later
      let label = testId.substring(testId.lastIndexOf(path.sep) + 1)
      if (this.locationPattern.test(testId)) {
        label = this.getPlaceholderLabelForSingleTest(testId)
      }
      let uri = vscode.Uri.file(path.resolve(this.config.getTestDirectory(), testId.replace(this.locationPattern, '')))
      testItem = this.controller.createTestItem(testId, label, uri);
      testItem.canResolveChildren = !this.locationPattern.test(testId)
      collection.add(testItem);
      log.debug(`Added test ${testItem.id}`)
    }
    return testItem
  }

  public getTestItem(testId: string | vscode.Uri): vscode.TestItem | undefined {
    let log = this.log.getChildLogger({label: 'getTestItem'})
    testId = this.uriToTestId(testId)
    let collection = this.getOrCreateParentTestItemCollection(testId)
    let testItem = collection.get(testId)
    if (!testItem) {
      log.debug(`Couldn't find ${testId}`)
      return undefined
    }
    return testItem
  }

  public normaliseTestId(testId: string): string {
    if (testId.startsWith(`.${path.sep}`)) {
      testId = testId.substring(2)
    }
    if (testId.startsWith(this.config.getTestDirectory())) {
      testId = testId.replace(this.config.getTestDirectory(), '')
      if (testId.startsWith(path.sep)) {
        testId.substring(1)
      }
    }
    return testId
  }

  private uriToTestId(uri: string | vscode.Uri): string {
    if (typeof uri === "string")
      return uri
    return uri.fsPath.replace(
      path.resolve(
        vscode.workspace?.workspaceFolders![0].uri.fsPath,
        this.config.getTestDirectory()) + path.sep,
      '')
  }

  private getParentTestItemCollection(testId: string): vscode.TestItemCollection {
    testId = testId.replace(/^\.\/spec\//, '')
    let idSegments = testId.split(path.sep)
    if (idSegments[0] === "") {
      idSegments.splice(0, 1)
    }
    let collection: vscode.TestItemCollection = this.controller.items

    // Walk the test hierarchy to find the collection containing our test file
    for (let i = 0; i < idSegments.length - 1; i++) {
      let collectionId = (i == 0)
        ? idSegments[0]
        : idSegments.slice(0, i + 1).join(path.sep)
      let childCollection = collection.get(collectionId)?.children
      if (!childCollection) {
        throw `Test collection not found: ${collectionId}`
      }
      collection = childCollection
    }

    // Need to make sure we strip locations from file id to get final collection
    let fileId = testId.replace(this.locationPattern, '')
    let childCollection = collection.get(fileId)?.children
    if (!childCollection) {
      throw `Test collection not found: ${fileId}`
    }
    collection = childCollection
    return collection
  }

  private getOrCreateParentTestItemCollection(testId: string): vscode.TestItemCollection {
    let log = this.log.getChildLogger({label: `getOrCreateParentTestItemCollection(${testId})`})
    testId = testId.replace(/^\.\/spec\//, '')
    let idSegments = testId.split(path.sep)
    log.debug('id segments', idSegments)
    if (idSegments[0] === "") {
      idSegments.splice(0, 1)
    }
    let collection: vscode.TestItemCollection = this.controller.items

    // Walk the test hierarchy to find the collection containing our test file
    for (let i = 0; i < idSegments.length - 1; i++) {
      let collectionId = (i == 0)
        ? idSegments[0]
        : idSegments.slice(0, i + 1).join(path.sep)
      log.debug(`Getting parent collection ${collectionId}`)
      let childCollection = collection.get(collectionId)?.children
      if (!childCollection) {
        log.debug(`${collectionId} not found, creating`)
        let label = idSegments[i]
        let uri = vscode.Uri.file(path.resolve(this.config.getTestDirectory(), collectionId))
        let child = this.controller.createTestItem(collectionId, label, uri)
        child.canResolveChildren = true
        collection.add(child)
        childCollection = child.children
      }
      collection = childCollection
    }

    if (this.locationPattern.test(testId)) {
      // Test item is a test within a file
      // Need to make sure we strip locations from file id to get final collection
      let fileId = testId.replace(this.locationPattern, '')
      if (fileId.startsWith(path.sep)) {
        fileId = fileId.substring(1)
      }
      log.debug(`Getting file collection ${fileId}`)
      let childCollection = collection.get(fileId)?.children
      if (!childCollection) {
        log.debug(`${fileId} not found, creating`)
        let child = this.controller.createTestItem(fileId, fileId.substring(fileId.lastIndexOf(path.sep) + 1), vscode.Uri.file(path.resolve(this.config.getTestDirectory(), fileId)))
        child.canResolveChildren = true
        collection.add(child)
        childCollection = child.children
      }
      collection = childCollection
    }
    // else test item is the file so return the file's parent
    return collection
  }

  private getPlaceholderLabelForSingleTest(testId: string): string {
    return `Awaiting test details... (location: ${this.locationPattern.exec(testId)})`
  }
}