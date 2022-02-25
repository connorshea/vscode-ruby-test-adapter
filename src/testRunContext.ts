import * as vscode from 'vscode'
import path from 'path'
import { IChildLogger } from '@vscode-logging/logger'
import { Config } from './config'

/**
 * Test run context
 *
 * Contains all objects used for interacting with VS Test API while tests are running
 */
export class TestRunContext {
  public readonly testRun: vscode.TestRun

  /**
   * Create a new context
   *
   * @param log Logger
   * @param token Cancellation token triggered when the user cancels a test operation
   * @param request Test run request for creating test run object
   * @param controller Test controller to look up tests for status reporting
   * @param debuggerConfig A VS Code debugger configuration.
   */
  constructor(
    public readonly log: IChildLogger,
    public readonly token: vscode.CancellationToken,
    request: vscode.TestRunRequest,
    private readonly controller: vscode.TestController,
    public readonly config: Config,
    public readonly debuggerConfig?: vscode.DebugConfiguration
  ) {
    this.testRun = controller.createTestRun(request)
  }

  /**
   * Indicates a test is queued for later execution.
   *
   * @param testId ID of the test item to update.
   */
  public enqueued(test: string | vscode.TestItem): void {
    if (typeof test === "string") {
        try {
          this.testRun.enqueued(this.getTestItem(test))
          this.log.debug(`Enqueued: ${test}`)
        } catch (e: any) {
          this.log.error(`Failed to set test ${test} as Enqueued`, e)
        }
      }
      else {
        this.testRun.enqueued(test)
        this.log.debug(`Enqueued: ${test.id}`)
      }
  }

  /**
   * Indicates a test has errored.
   *
   * This differs from the "failed" state in that it indicates a test that couldn't be executed at all, from a compilation error for example
   *
   * @param testId ID of the test item to update.
   * @param message Message(s) associated with the test failure.
   * @param duration How long the test took to execute, in milliseconds.
   */
  public errored(
    testId: string,
    message: string,
    file: string,
    line: number,
    duration?: number | undefined
  ): void {
    let testMessage = new vscode.TestMessage(message)
    try {
      let testItem = this.getTestItem(testId)
      testMessage.location = new vscode.Location(
        testItem.uri ?? vscode.Uri.file(file),
        new vscode.Position(line, 0)
      )
      this.testRun.errored(testItem, testMessage, duration)
      this.log.debug(`Errored: ${testId} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
    } catch (e: any) {
      this.log.error(`Failed to set test ${test} as Errored`, e)
    }
  }

  /**
   * Indicates a test has failed.
   *
   * @param testId ID of the test item to update.
   * @param message Message(s) associated with the test failure.
   * @param file Path to the file containing the failed test
   * @param line Line number where the error occurred
   * @param duration How long the test took to execute, in milliseconds.
   */
  public failed(
    testId: string,
    message: string,
    file: string,
    line: number,
    duration?: number | undefined
  ): void {
    try {
      let testMessage = new vscode.TestMessage(message)
      let testItem = this.getTestItem(testId)
      testMessage.location = new vscode.Location(
        testItem.uri ?? vscode.Uri.file(file),
        new vscode.Position(line, 0)
      )
      this.testRun.failed(testItem, testMessage, duration)
      this.log.debug(`Failed: ${testId} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
    } catch (e: any) {
      this.log.error(`Failed to set test ${test} as Failed`, e)
    }
  }

  /**
   * Indicates a test has passed.
   *
   * @param testId ID of the test item to update.
   * @param duration How long the test took to execute, in milliseconds.
   */
  public passed(
    testId: string,
    duration?: number | undefined
  ): void {
    try {
      this.testRun.passed(this.getTestItem(testId), duration)
      this.log.debug(`Passed: ${testId}${duration ? `, duration: ${duration}ms` : ''}`)
    } catch (e: any) {
      this.log.error(`Failed to set test ${test} as Passed`, e)
    }
  }

  /**
   * Indicates a test has been skipped.
   *
   * @param test ID of the test item to update, or the test item.
   */
  public skipped(test: string | vscode.TestItem): void {
    if (typeof test === "string") {
      try {
        this.testRun.skipped(this.getTestItem(test))
        this.log.debug(`Skipped: ${test}`)
      } catch (e: any) {
        this.log.error(`Failed to set test ${test} as Skipped`, e)
      }
    }
    else {
      this.testRun.skipped(test)
      this.log.debug(`Skipped: ${test.id}`)
    }
  }

  /**
   * Indicates a test has started running.
   *
   * @param testId ID of the test item to update, or the test item.
   */
  public started(test: string | vscode.TestItem): void {
    if (typeof test === "string") {
      try {
        this.testRun.started(this.getTestItem(test))
        this.log.debug(`Started: ${test}`)
      } catch (e: any) {
        this.log.error(`Failed to set test ${test} as Started`, e)
      }
    }
    else {
      this.testRun.started(test)
      this.log.debug(`Started: ${test.id}`)
    }
  }

  /**
   * Get the {@link vscode.TestItem} for a test ID
   * @param testId Test ID to lookup
   * @returns The test item for the ID
   * @throws if test item could not be found
   */
  public getTestItem(testId: string): vscode.TestItem {
    let log = this.log.getChildLogger({label: `${this.getTestItem.name}(${testId})`})
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
    log.debug("Got parent collection, looking for test")

    let testItem = collection.get(testId)
    if (!testItem) {
      // Create a basic test item with what little info we have to be filled in later
      testItem = this.controller.createTestItem(testId, idSegments[idSegments.length - 1], vscode.Uri.file(path.resolve(this.config.getTestDirectory(), testId)));
      collection.add(testItem);
    }
    return testItem
  }
}
