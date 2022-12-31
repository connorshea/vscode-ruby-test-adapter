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
  public readonly log: IChildLogger

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
    readonly rootLog: IChildLogger,
    public readonly token: vscode.CancellationToken,
    readonly request: vscode.TestRunRequest,
    readonly controller: vscode.TestController,
    public readonly config: Config,
    public readonly debuggerConfig?: vscode.DebugConfiguration
  ) {
    this.log = rootLog.getChildLogger({ label: "TestRunContext" })
    this.testRun = controller.createTestRun(request)
  }

  /**
   * Indicates a test is queued for later execution.
   *
   * @param test Test item to update.
   */
  public enqueued(test: vscode.TestItem): void {
    this.testRun.enqueued(test)
    this.log.debug(`Enqueued: ${test.id}`)
  }

  /**
   * Indicates a test has errored.
   *
   * This differs from the "failed" state in that it indicates a test that couldn't be executed at all, from a compilation error for example
   *
   * @param test Test item to update.
   * @param message Message(s) associated with the test failure.
   * @param duration How long the test took to execute, in milliseconds.
   */
  public errored(
    test: vscode.TestItem,
    message: string,
    file: string,
    line: number,
    duration?: number | undefined
  ): void {
    let testMessage = new vscode.TestMessage(message)
    try {
      let testItem = test
      testMessage.location = new vscode.Location(
        testItem.uri ?? vscode.Uri.file(file),
        new vscode.Position(line, 0)
      )
      this.testRun.errored(testItem, testMessage, duration)
      this.log.debug(`Errored: ${test.id} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
    } catch (e: any) {
      this.log.error(`Failed to set test ${test} as Errored`, e)
    }
  }

  /**
   * Indicates a test has failed.
   *
   * @param test Test item to update.
   * @param message Message(s) associated with the test failure.
   * @param file Path to the file containing the failed test
   * @param line Line number where the error occurred
   * @param duration How long the test took to execute, in milliseconds.
   */
  public failed(
    test: vscode.TestItem,
    message: string,
    file: string,
    line: number,
    duration?: number | undefined
  ): void {
    let testMessage = new vscode.TestMessage(message)
    testMessage.location = new vscode.Location(
      test.uri ?? vscode.Uri.file(file),
      new vscode.Position(line, 0)
    )
    this.testRun.failed(test, testMessage, duration)
    this.log.debug(`Failed: ${test.id} (${file}:${line})${duration ? `, duration: ${duration}ms` : ''} - ${message}`)
  }

  /**
   * Indicates a test has passed.
   *
   * @param test Test item to update.
   * @param duration How long the test took to execute, in milliseconds.
   */
  public passed(test: vscode.TestItem,
    duration?: number | undefined
  ): void {
    this.testRun.passed(test, duration)
    this.log.debug(`Passed: ${test.id}${duration ? `, duration: ${duration}ms` : ''}`)
  }

  /**
   * Indicates a test has been skipped.
   *
   * @param test ID of the test item to update, or the test item.
   */
  public skipped(test: vscode.TestItem): void {
    this.testRun.skipped(test)
    this.log.debug(`Skipped: ${test.id}`)
  }

  /**
   * Indicates a test has started running.
   *
   * @param test Test item to update, or the test item.
   */
  public started(test: vscode.TestItem): void {
    this.testRun.started(test)
    this.log.debug(`Started: ${test.id}`)
  }
}
