import { TestRunner } from '../testRunner';
import { TestRunContext } from '../testRunContext';

// TODO - figure out which of these are RSpec only
type ParsedTest = {
  id: string,
  full_description: string, // RSpec
  description: string, // RSpec
  file_path: string,
  line_number: number,
  location?: number, // RSpec
  status?: string,
  pending_message?: string | null,
  exception?: any,
  type?: any // RSpec - presumably tag name/focus?
}

export class RspecTestRunner extends TestRunner {
  // RSpec only notifies on test completion
  canNotifyOnStartingTests: boolean = false

  /**
   * Handles test state based on the output returned by the custom RSpec formatter.
   *
   * @param test The test that we want to handle.
   * @param context Test run context
   */
  handleStatus(test: ParsedTest, context: TestRunContext): void {
    let log = this.log.getChildLogger({ label: "handleStatus" })
    log.trace("Handling status of test", test);
    let testItem = this.manager.getOrCreateTestItem(test.id)
    if (test.status === "passed") {
      log.trace("Passed", testItem.id)
      context.passed(testItem)
    } else if (test.status === "failed" && test.pending_message === null) {
      log.trace("Failed/Errored", testItem.id)
      // Remove linebreaks from error message.
      let errorMessageNoLinebreaks = test.exception.message.replace(/(\r\n|\n|\r)/, ' ');
      // Prepend the class name to the error message string.
      let errorMessage: string = `${test.exception.class}:\n${errorMessageNoLinebreaks}`;

      let fileBacktraceLineNumber: number | undefined;

      let filePath = test.file_path.replace('./', '');

      // Add backtrace to errorMessage if it exists.
      if (test.exception.backtrace) {
        errorMessage += `\n\nBacktrace:\n`;
        test.exception.backtrace.forEach((line: string) => {
          errorMessage += `${line}\n`;
          // If the backtrace line includes the current file path, try to get the line number from it.
          if (line.includes(filePath)) {
            let filePathArray = filePath.split('/');
            let fileName = filePathArray[filePathArray.length - 1];
            // Input: spec/models/game_spec.rb:75:in `block (3 levels) in <top (required)>
            // Output: 75
            let regex = new RegExp(`${fileName}\:(\\d+)`);
            let match = line.match(regex);
            if (match && match[1]) {
              fileBacktraceLineNumber = parseInt(match[1]);
            }
          }
        });
      }

      if (test.exception.class.startsWith("RSpec")) {
        context.failed(
          testItem,
          errorMessage,
          filePath,
          (fileBacktraceLineNumber ? fileBacktraceLineNumber : test.line_number) - 1,
        )
      } else {
        context.errored(
          testItem,
          errorMessage,
          filePath,
          (fileBacktraceLineNumber ? fileBacktraceLineNumber : test.line_number) - 1,
        )
      }
    } else if ((test.status === "pending" || test.status === "failed") && test.pending_message !== null) {
      // Handle pending test cases.
      log.trace("Skipped", testItem.id)
      context.skipped(testItem)
    }
  };
}
