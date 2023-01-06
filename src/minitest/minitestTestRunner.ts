import { TestRunner } from '../testRunner';
import { TestRunContext } from '../testRunContext';

export class MinitestTestRunner extends TestRunner {
  // Minitest notifies on test start
  canNotifyOnStartingTests: boolean = true

  /**
   * Handles test state based on the output returned by the Minitest Rake task.
   *
   * @param test The test that we want to handle.
   * @param context Test run context
   */
  handleStatus(test: any, context: TestRunContext): void {
    let log = this.log.getChildLogger({ label: "handleStatus" })
    log.trace("Handling status of test", test);
    let testItem = this.manager.getOrCreateTestItem(test.id)
    if (test.status === "passed") {
      context.passed(testItem)
    } else if (test.status === "failed" && test.pending_message === null) {
      // Failed/Errored
      let errorMessageLine: number = test.line_number;
      let errorMessage: string = test.exception.message;

      if (test.exception.position) {
        errorMessageLine = test.exception.position;
      }

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
        errorMessage += `\n\nFull Backtrace:\n`;
        test.exception.full_backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
        });
      }

      if (test.exception.class === "Minitest::UnexpectedError") {
        context.errored(
          testItem,
          errorMessage,
          test.file_path.replace('./', ''),
          errorMessageLine - 1
        )
      } else {
        context.failed(
          testItem,
          errorMessage,
          test.file_path.replace('./', ''),
          errorMessageLine - 1
        )
      }
    } else if (test.status === "failed" && test.pending_message !== null) {
      // Handle pending test cases.
      context.skipped(testItem)
    }
  };
}
