import * as vscode from 'vscode'
import { IChildLogger } from '@vscode-logging/logger'

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
   * @param cancellationToken Cancellation token triggered when the user cancels a test operation
   * @param request Test run request for creating test run object
   * @param controller Test controller to look up tests for status reporting
   * @param debuggerConfig A VS Code debugger configuration.
   */
  constructor(
    readonly rootLog: IChildLogger,
    public readonly cancellationToken: vscode.CancellationToken,
    readonly request: vscode.TestRunRequest,
    readonly controller: vscode.TestController,
    public readonly debuggerConfig?: vscode.DebugConfiguration
  ) {
    this.log = rootLog.getChildLogger({ label: `TestRunContext(${request.profile?.label})` })
    this.log.info('Creating test run');
    this.testRun = controller.createTestRun(request)
  }

  /**
   * Indicates a test is queued for later execution.
   *
   * @param test Test item to update.
   */
  public enqueued(test: vscode.TestItem): void {
    this.log.debug('Enqueued test', test.id)
    this.testRun.enqueued(test)
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
    message: vscode.TestMessage,
    duration?: number
  ): void {
    this.log.debug('Errored test', test.id, duration, message.message)
    this.testRun.errored(test, message, duration)
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
    message: vscode.TestMessage,
    duration?: number
  ): void {
    this.log.debug('Failed test', test.id, duration, message.message)
    this.testRun.failed(test, message, duration)
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
    this.log.debug('Passed test', test.id, duration)
    this.testRun.passed(test, duration)
  }

  /**
   * Indicates a test has been skipped.
   *
   * @param test ID of the test item to update, or the test item.
   */
  public skipped(test: vscode.TestItem): void {
    this.log.debug('Skipped test', test.id)
    this.testRun.skipped(test)
  }

  /**
   * Indicates a test has started running.
   *
   * @param test Test item to update, or the test item.
   */
  public started(test: vscode.TestItem): void {
    this.log.debug('Started test', test.id)
    this.testRun.started(test)
  }

  public endTestRun(): void {
    this.log.debug('Ending test run');
    this.testRun.end()
  }
}
