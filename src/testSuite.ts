import * as vscode from 'vscode'
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger';
import { Config } from './config';

export class TestSuite {
  private readonly log: IChildLogger;

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
    let collection = this.getParentTestItemCollection(testId)
    let testItem = collection.get(testId)
    if (!testItem) {
      // Create a basic test item with what little info we have to be filled in later
      testItem = this.controller.createTestItem(testId, testId.substring(testId.lastIndexOf(path.sep)), vscode.Uri.file(path.resolve(this.config.getTestDirectory(), testId)));
      collection.add(testItem);
      log.debug(`Added test ${testItem.id}`)
    }
    return testItem
  }

  public getTestItem(testId: string | vscode.Uri): vscode.TestItem | undefined {
    let log = this.log.getChildLogger({label: 'getTestItem'})
    testId = this.uriToTestId(testId)
    let collection = this.getParentTestItemCollection(testId)
    let testItem = collection.get(testId)
    if (!testItem) {
      log.debug(`Couldn't find ${testId}`)
      return undefined
    }
    return testItem
  }

  private uriToTestId(uri: string | vscode.Uri): string {
    if (typeof uri === "string")
      return uri
    return uri.fsPath.replace(path.resolve(this.config.getTestDirectory()), '')
  }

  private getParentTestItemCollection(testId: string): vscode.TestItemCollection {
    testId = testId.replace(/^\.\/spec\//, '')
    let idSegments = testId.split(path.sep)
    let collection: vscode.TestItemCollection = this.controller.items

    // Walk the test hierarchy to find the collection containing our test file
    for (let i = 0; i < idSegments.length - 1; i++) {
      let collectionId = (i == 0)
        ? idSegments[0]
        : idSegments.slice(0,i).join(path.sep)
      let childCollection = collection.get(collectionId)?.children
      if (!childCollection) {
        throw `Test collection not found: ${collectionId}`
      }
      collection = childCollection
    }

    // Need to make sure we strip locations from file id to get final collection
    let fileId = testId.replace(/\[[0-9](?::[0-9])*\]$/, '')
    let childCollection = collection.get(fileId)?.children
    if (!childCollection) {
      throw `Test collection not found: ${fileId}`
    }
    collection = childCollection
    return collection
  }
}