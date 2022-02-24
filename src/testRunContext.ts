import * as vscode from 'vscode'
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
      this.log.debug(`Enqueued: ${test}`)
      this.testRun.enqueued(this.getTestItem(test))
    }
    else {
      this.log.debug(`Enqueued: ${test.id}`)
      this.testRun.enqueued(test)
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
    this.log.debug(`Errored: ${testId} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
    let testMessage = new vscode.TestMessage(message)
    let testItem = this.getTestItem(testId)
    testMessage.location = new vscode.Location(
      testItem.uri ?? vscode.Uri.file(file),
      new vscode.Position(line, 0)
    )
    this.testRun.errored(testItem, testMessage, duration)
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
    this.log.debug(`Failed: ${testId} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
    let testMessage = new vscode.TestMessage(message)
    let testItem = this.getTestItem(testId)
    testMessage.location = new vscode.Location(
      testItem.uri ?? vscode.Uri.file(file),
      new vscode.Position(line, 0)
    )
    this.testRun.failed(testItem, testMessage, duration)
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
    this.log.debug(`Passed: ${testId}${duration ? `, duration: ${duration}ms` : ''}`)
    this.testRun.passed(this.getTestItem(testId), duration)
  }

  /**
   * Indicates a test has been skipped.
   *
   * @param test ID of the test item to update, or the test item.
   */
  public skipped(test: string | vscode.TestItem): void {
    if (typeof test === "string") {
      this.log.debug(`Skipped: ${test}`)
      this.testRun.skipped(this.getTestItem(test))
    }
    else {
      this.log.debug(`Skipped: ${test.id}`)
      this.testRun.skipped(test)
    }
  }

  /**
   * Indicates a test has started running.
   *
   * @param testId ID of the test item to update, or the test item.
   */
  public started(test: string | vscode.TestItem): void {
    if (typeof test === "string") {
      this.log.debug(`Started: ${test}`)
      this.testRun.started(this.getTestItem(test))
    }
    else {
      this.log.debug(`Started: ${test.id}`)
      this.testRun.started(test)
    }
  }

  /**
   * Get the {@link vscode.TestItem} for a test ID
   * @param testId Test ID to lookup
   * @returns The test item for the ID
   * @throws if test item could not be found
   */
  public getTestItem(testId: string): vscode.TestItem {
    testId = testId.replace(/^\.\/spec\//, '')
    let testItem = this.controller.items.get(testId)
    if (!testItem) {
      throw `Test not found on controller: ${testId}`
    }
    return testItem
  }
}
