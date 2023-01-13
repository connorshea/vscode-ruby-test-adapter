import * as vscode from 'vscode'
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger';
import { Config } from './config';

export type TestItemCallback = (item: vscode.TestItem) => void

/**
 * Manages the contents and state of the test suite
 *
 * Responsible for creating, deleting and finding test items
 */
export class TestSuiteManager {
  private readonly log: IChildLogger;

  constructor(
    readonly rootLog: IChildLogger,
    public readonly controller: vscode.TestController,
    public readonly config: Config
  ) {
    this.log = rootLog.getChildLogger({label: `${TestSuiteManager.name}`});
  }

  public deleteTestItem(testId: string) {
    let log = this.log.getChildLogger({label: 'deleteTestItem'})
    testId = this.normaliseTestId(testId)
    log.debug('Deleting test: %s', testId)
    let testItem = this.getTestItem(testId)
    if (!testItem) {
      log.error('No test item found with given ID: %s', testId)
      return
    }
    let collection = testItem.parent ? testItem.parent.children : this.controller.items
    if (collection) {
      collection.delete(testId);
      log.debug('Removed test: %s', testId)
    } else {
      log.error('Parent collection not found')
    }
  }

  /**
   * Get the {@link vscode.TestItem} for a test ID
   * @param testId Test ID to lookup
   * @param onItemCreated Optional callback to be notified when test items are created
   * @returns The test item for the ID
   * @throws if test item could not be found
   */
  public getOrCreateTestItem(testId: string, onItemCreated?: TestItemCallback): vscode.TestItem {
    let log = this.log.getChildLogger({label: 'getOrCreateTestItem'})
    return this.getTestItemInternal(log, testId, true, onItemCreated)!
  }

  /**
   * Gets a TestItem from the list of tests
   * @param testId ID of the TestItem to get
   * @returns TestItem if found, else undefined
   */
  public getTestItem(testId: string): vscode.TestItem | undefined {
    let log = this.log.getChildLogger({label: 'getTestItem'})
    return this.getTestItemInternal(log, testId, false)
  }

  /**
   * Takes a test ID from the test runner output and normalises it to a consistent format
   *
   * - Removes leading './' if present
   * - Removes leading test dir if present
   */
  public normaliseTestId(testId: string): string {
    let log = this.log.getChildLogger({label: `${this.normaliseTestId.name}`})
    if (testId.startsWith(`.${path.sep}`)) {
      testId = testId.substring(2)
    }
    if (testId.startsWith(this.config.getRelativeTestDirectory())) {
      testId = testId.replace(this.config.getRelativeTestDirectory(), '')
    }
    if (testId.startsWith(path.sep)) {
      testId = testId.substring(1)
    }
    log.debug('Normalised ID: %s', testId)
    return testId
  }

  private testIdToUri(testId: string): vscode.Uri {
    return vscode.Uri.file(path.resolve(this.config.getAbsoluteTestDirectory(), testId.replace(/\[.*\]/, '')))
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
    onItemCreated: TestItemCallback = (_) => {},
    canResolveChildren: boolean = true,
  ): vscode.TestItem {
    let log = this.log.getChildLogger({ label: `${this.createTestItem.name}` })
    let uri = this.testIdToUri(testId)
    log.debug('Creating test item', {label: label, parentId: parent?.id, canResolveChildren: canResolveChildren, uri: uri})
    let item = this.controller.createTestItem(testId, label, uri)
    item.canResolveChildren = canResolveChildren;
    (parent?.children || this.controller.items).add(item);
    log.debug('Added test: %s', item.id)
    onItemCreated(item)
    return item
  }

  /**
   * Splits a test ID into an array of all parent IDs to reach the given ID from the test tree root
   * @param testId test ID to split
   * @returns array of test IDs
   */
  private getParentIdsFromId(testId: string): string[] {
    let log = this.log.getChildLogger({label: `${this.getParentIdsFromId.name}`})
    testId = this.normaliseTestId(testId)

    // Split path segments
    let idSegments = testId.split(path.sep)
    log.debug('id segments', idSegments)
    if (idSegments[0] === "") {
      idSegments.splice(0, 1)
    }
    for (let i = 1; i < idSegments.length - 1; i++) {
      let precedingSegments = idSegments.slice(0, i + 1)
      idSegments[i] = path.join(...precedingSegments)
    }

    // Split location
    const match = idSegments.at(-1)?.match(/(?<fileId>[^\[]*)(?:\[(?<location>[0-9:]+)\])?/)
    if (match && match.groups) {
      // Get file ID (with path to it if there is one)
      let fileId = match.groups["fileId"]
      if (idSegments.length > 1) {
        fileId = path.join(idSegments.at(-2)!, fileId)
      }
      // Add file ID to array
      idSegments.splice(-1, 1, fileId)

      if (match.groups["location"]) {
        let locations = match.groups["location"].split(':')
        if (locations.length == 1) {
          // Insert ID for minitest location
          let contextId = `${fileId}[${locations[0]}]`
          idSegments.push(contextId)
        } else {
          // Insert IDs for each nested RSpec context if there are any
          for (let i = 1; i < locations.length; i++) {
            let contextId = `${fileId}[${locations.slice(0, i + 1).join(':')}]`
            idSegments.push(contextId)
          }
        }
      }
    }
    log.trace('Final ID segments list', idSegments)
    return idSegments
  }

  private getTestItemInternal(
    log: IChildLogger,
    testId: string,
    createIfMissing: boolean,
    onItemCreated?: TestItemCallback
  ): vscode.TestItem | undefined {
    testId = this.normaliseTestId(testId)

    log.debug('Looking for test: %s', testId)
    let parentIds = this.getParentIdsFromId(testId)
    let item: vscode.TestItem | undefined = undefined
    let itemCollection: vscode.TestItemCollection = this.controller.items

    // Walk through test folders to find the collection containing our test file,
    // creating parent items as needed
    for (const id of parentIds) {
      log.debug('Getting item %s from parent collection %s', id, item?.id || 'controller')
      let child = itemCollection.get(id)
      if (!child) {
        if (createIfMissing) {
          child = this.createTestItem(
            id,
            id.substring(id.lastIndexOf(path.sep) + 1), // Temporary label
            item,
            onItemCreated,
            this.canResolveChildren(id, testId) // Only the test ID will be a test case. All parents need this set to true
          )
        } else {
          return undefined
        }
      }
      item = child
      itemCollection = child.children
    }

    return item
  }

  private canResolveChildren(itemId: string, testId: string): boolean {
    if (itemId.endsWith(']')) {
      return itemId !== testId
    } else {
      return true
    }
  }
}
