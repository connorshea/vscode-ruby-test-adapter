import * as childProcess from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import split2 from 'split2';
import { IChildLogger } from '@vscode-logging/logger';
import { Status, TestStatus } from './testStatus';
import { TestSuiteManager } from './testSuiteManager';

type ParsedTest = {
  id: string,
  full_description: string,
  description: string,
  file_path: string,
  line_number: number,
  duration: number,
  status?: string,
  pending_message?: string | null,
  exception?: any,
  location?: number, // RSpec
  type?: any // RSpec - presumably tag name/focus?
  full_path?: string, // Minitest
  klass?: string, // Minitest
  method?: string, // Minitest
  runnable?: string, // Minitest
}

export class FrameworkProcess implements vscode.Disposable {
  private childProcess?: childProcess.ChildProcess;
  protected readonly log: IChildLogger;
  private readonly disposables: vscode.Disposable[] = []
  private isDisposed = false;
  private testRunStarted = false;
  private preTestErrorLines: string[] = []
  public readonly testStatusEmitter: vscode.EventEmitter<TestStatus> = new vscode.EventEmitter<TestStatus>()
  private readonly statusPattern =
    new RegExp(/(?<status>RUNNING|PASSED|FAILED|ERRORED|SKIPPED)(:?\((:?(?<exceptionClass>(:?\w*(:?::)?)*)\:)?\s*(?<exceptionMessage>.*)\))?\: (?<id>.*)/)

  constructor(
    readonly rootLog: IChildLogger,
    private readonly testCommand: string,
    private readonly spawnArgs: childProcess.SpawnOptions,
    private readonly cancellationToken: vscode.CancellationToken,
    private readonly testManager: TestSuiteManager,
  ) {
    this.log = rootLog.getChildLogger({label: 'FrameworkProcess'})
    this.disposables.push(this.cancellationToken.onCancellationRequested(() => {
      this.log.debug('Cancellation requested')
      this.dispose()
    }))

    /*
     * Create a listener so that we know when any tests have actually started running. Until this happens, any output
     * is likely to be an error message and needs collecting up to be logged in one message.
     */
    let testRunStartedListener = this.testStatusEmitter.event((e) => {
      if (e.status == Status.running) {
	      this.log.info('Test run started - stopped capturing error output', { event: e })
        this.testRunStarted = true
        this.preTestErrorLines = []
        testRunStartedListener.dispose()
      }
    })
    this.disposables.push(testRunStartedListener)
  }

  dispose() {
    this.log.debug("Dispose called")
    this.isDisposed = true
    if (this.childProcess) {
      if (this.childProcess.kill()) {
        this.log.debug("Child process killed")
      } else {
        this.log.debug("Attempt to kill child process failed")
      }
    } else {
      this.log.debug("Child process not running - not killing")
    }
    for (const disposable of this.disposables) {
      try {
        disposable.dispose()
      } catch (err) {
        this.log.error('Error disposing object', disposable, err)
      }
    }
  }

  public async startProcess(
    args: string[],
    onDebugStarted?: (value: void | PromiseLike<void>) => void,
  ) {
    if (this.isDisposed) {
      return
    }

    try {
      this.log.debug('Starting child process', { env: this.spawnArgs })
      this.childProcess = childProcess.spawn(this.testCommand, args, this.spawnArgs)

      this.childProcess.stderr!.pipe(split2()).on('data', (data) => {
        let log = this.log.getChildLogger({label: 'stderr'})
        data = data.toString();
        if (data.startsWith('Fast Debugger') && onDebugStarted) {
          log.info('Notifying debug session that test process is ready to debug');
          onDebugStarted()
        } else {
	        if (this.testRunStarted) {
            log.warn('%s', data);
          } else {
            this.preTestErrorLines.push(data)
          }
        }
      })

      this.childProcess.stdout!.pipe(split2()).on('data', (data) => {
        let log = this.log.getChildLogger({label: 'stdout'})
        data = data.toString()
        log.trace(data)
        this.onDataReceived(data)
      });

      return await new Promise<{code:number, signal:string}>((resolve, reject) => {
        this.childProcess!.once('exit', (code: number, signal: string) => {
          this.log.trace('Child process exited', { exitCode: code, signal: signal })
        });
        this.childProcess!.once('close', (code: number, signal: string) => {
          if (code == 0) {
            this.log.debug('Child process exited successfully, and all streams closed', { exitCode: code, signal: signal })
            resolve({code, signal});
          } else {
            this.log.error('Child process exited abnormally, and all streams closed', { exitCode: code, signal: signal })
            reject(new Error(`Child process exited abnormally. Status code: ${code}${signal ? `, signal: ${signal}` : ''}`));
          }
        });
        this.childProcess!.once('error', (err: Error) => {
          this.log.error('Error event from child process: %s', err.message)
          reject(err);
        });
      })
    } finally {
      if (this.preTestErrorLines.length > 0) {
        this.log.error('Test process failed to run', { message: this.preTestErrorLines })
      }
      this.dispose()
    }
  }

  private onDataReceived(data: string): void {
    let log = this.log.getChildLogger({label: 'onDataReceived'})

    let getTest = (testId: string): vscode.TestItem => {
      testId = this.testManager.normaliseTestId(testId)
      return this.testManager.getOrCreateTestItem(testId)
    }
    try {
      if (data.includes('START_OF_TEST_JSON')) {
        log.trace("Received test run results: %s", data);
        this.parseAndHandleTestOutput(data);
      } else {
        const match = this.statusPattern.exec(data)
        if (match && match.groups) {
          log.trace("Received test status event: %s", data);
          const id = match.groups['id']
          const status = match.groups['status']
          let testItem = getTest(id)

          this.testStatusEmitter.fire(new TestStatus(
            testItem,
            Status[status.toLocaleLowerCase() as keyof typeof Status],
            // undefined, // TODO?: get duration info here if possible
            // errorMessage, // TODO: get exception info here once we can send full exception data
          ))
        } else {
          if (this.testRunStarted) {
            log.info("stdout: %s", data)
          } else {
            this.preTestErrorLines.push(data)
          }
        }
      }
    } catch (err) {
      log.error('Error parsing output', { error: err })
    }
  }

  private parseAndHandleTestOutput(testOutput: string): void {
    let log = this.log.getChildLogger({label: this.parseAndHandleTestOutput.name})
    testOutput = this.getJsonFromOutput(testOutput);
    log.trace('Parsing the below JSON: %s', testOutput);
    let testMetadata = JSON.parse(testOutput);
    let tests: Array<ParsedTest> = testMetadata.examples;

    let existingContainers: vscode.TestItem[] = []
    let parsedTests: vscode.TestItem[] = []
    if (tests && tests.length > 0) {
      tests.forEach((test: ParsedTest) => {
        test.id = this.testManager.normaliseTestId(test.id)
        let itemAlreadyExists = true
        let testItem = this.testManager.getOrCreateTestItem(test.id, (item) => { if (item.id == test.id) itemAlreadyExists = false })

        testItem.canResolveChildren = !test.id.endsWith(']')
        log.trace('canResolveChildren (%s): %s', test.id, testItem.canResolveChildren)

        testItem.label = this.parseDescription(test)
        log.trace('label (%s): %s', test.id, testItem.description)

        testItem.range = this.parseRange(test)

        parsedTests.push(testItem)
        if (testItem.canResolveChildren && itemAlreadyExists) {
          existingContainers.push(testItem)
        }
        log.debug('Parsed test', test)

        if (test.status) {
          this.handleStatus(testItem, test)
        }
      });
      for (const testFile of existingContainers) {
        /*
         * If a container test item (file, folder, suite, etc) already existed and was part of this test run (which
         * means that we can be sure all its children are in the test run output) then replace any children it had
         * with only the children that were in the test run output
         *
         * This means that when tests are removed from collections, they will be removed from the test suite
         */
        testFile.children.replace(parsedTests.filter(x => !x.canResolveChildren && x.parent == testFile))
      }
    }
    if (testMetadata.summary) {
      log.info('Test run completed in %d ms', testMetadata.summary.duration)
    }
  }

  private parseDescription(test: ParsedTest): string {
    // RSpec provides test ids like "file_name.rb[1:2:3]".
    // This uses the digits at the end of the id to create
    // an array of numbers representing the location of the
    // test in the file.
    let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
    let testNumber = test_location_array[test_location_array.length - 1];
    test.file_path = this.testManager.normaliseTestId(test.file_path).replace(/\[.*/, '')

    // If the test doesn't have a name (because it uses the 'it do' syntax), "test #n"
    // is appended to the test description to distinguish between separate tests.
    let description = test.description.startsWith('example at ')
      ? `${test.full_description}test #${testNumber}`
      : test.full_description;

    let currentFileLabel = test.file_path.split(path.sep).slice(-1)[0]
    let pascalCurrentFileLabel = this.snakeToPascalCase(currentFileLabel.replace('_spec.rb', ''));
    // If the current file label doesn't have a slash in it and it starts with the PascalCase'd
    // file name, remove the from the start of the description. This turns, e.g.
    // `ExternalAccount Validations blah blah blah' into 'Validations blah blah blah'.
    if (!pascalCurrentFileLabel.includes(path.sep) && description.startsWith(pascalCurrentFileLabel)) {
      // Optional check for a space following the PascalCase file name. In some
      // cases, e.g. 'FileName#method_name` there's no space after the file name.
      let regexString = `${pascalCurrentFileLabel}[ ]?`;
      let regex = new RegExp(regexString, "g");
      description = description.replace(regex, '');
    }
    return description
  }

  private parseRange(test: ParsedTest): vscode.Range {
    // TODO: get end line numbers of tests, as well as start/end columns
    let zeroBasedStartLineNumber = test.line_number - 1
    return new vscode.Range(zeroBasedStartLineNumber, 0, zeroBasedStartLineNumber, 0);
  }

  /**
   * Handles test state based on the output returned by the custom RSpec formatter.
   *
   * @param parsedtest The test that we want to handle.
   * @param context Test run context
   */
  handleStatus(testItem: vscode.TestItem, parsedtest: ParsedTest): void {
    const log = this.log.getChildLogger({ label: "handleStatus" })
    log.trace("Handling status of test", parsedtest);
    const status = Status[parsedtest.status as keyof typeof Status]
    switch (status) {
      case Status.skipped:
        this.testStatusEmitter.fire(new TestStatus(testItem, status))
        break;
      case Status.passed:
        this.testStatusEmitter.fire(new TestStatus(testItem, status, parsedtest.duration))
        break;
      case Status.failed:
      case Status.errored:
        this.testStatusEmitter.fire(new TestStatus(testItem, status, parsedtest.duration, this.failureMessage(testItem, parsedtest)))
        break;
      default:
        log.error('Unexpected test status %s for test ID %s', status, testItem.id)
    }
  }

  private failureMessage(testItem: vscode.TestItem, parsedTest: ParsedTest): vscode.TestMessage {
    // Remove linebreaks from error message.
    let errorMessageNoLinebreaks = parsedTest.exception.message.replace(/(\r\n|\n|\r)/, ' ');
    // Prepend the class name to the error message string.
    let errorMessage: string = `${parsedTest.exception.class}:\n${errorMessageNoLinebreaks}`;

    let errorMessageLine: number | undefined;

    // Add backtrace to errorMessage if it exists.
    if (parsedTest.exception.backtrace) {
      errorMessage += `\n\nBacktrace:\n`;
      parsedTest.exception.backtrace.forEach((line: string) => {
        errorMessage += `${line}\n`;
      });
    }

    if (parsedTest.exception.position) {
      errorMessageLine = parsedTest.exception.position;
    }

    let testMessage = new vscode.TestMessage(errorMessage)
    testMessage.location = new vscode.Location(
      testItem.uri!,
      new vscode.Position(errorMessageLine || testItem.range!.start.line, 0)
    )
    return testMessage
  }

  /**
   * Convert a string from snake_case to PascalCase.
   * Note that the function will return the input string unchanged if it
   * includes a '/'.
   *
   * @param string The string to convert to PascalCase.
   * @return The converted string.
   */
  private snakeToPascalCase(string: string): string {
    if (string.includes('/')) { return string }
    return string.split("_").map(substr => substr.charAt(0).toUpperCase() + substr.slice(1)).join("");
  }

  /**
   * Pull JSON out of the test framework output.
   *
   * RSpec and Minitest frequently return bad data even when they're told to
   * format the output as JSON, e.g. due to code coverage messages and other
   * injections from gems. This gets the JSON by searching for
   * `START_OF_TEST_JSON` and an opening curly brace, as well as a closing
   * curly brace and `END_OF_TEST_JSON`. These are output by the custom
   * RSpec formatter or Minitest Rake task as part of the final JSON output.
   *
   * @param output The output returned by running a command.
   * @return A string representation of the JSON found in the output.
   */
  private getJsonFromOutput(output: string): string {
    output = output.substring(output.indexOf('START_OF_TEST_JSON{'), output.lastIndexOf('}END_OF_TEST_JSON') + 1);
    // Get rid of the `START_OF_TEST_JSON` and `END_OF_TEST_JSON` to verify that the JSON is valid.
    return output.substring(output.indexOf("{"), output.lastIndexOf("}") + 1);
  }
}
