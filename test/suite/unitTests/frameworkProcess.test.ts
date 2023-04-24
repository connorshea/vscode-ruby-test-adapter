import { after, afterEach, before, beforeEach } from 'mocha';
import { anything, capture, instance, mock, verify, when } from '@typestrong/ts-mockito'
import { expect } from 'chai';
import { IChildLogger } from '@vscode-logging/logger';
import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as vscode from 'vscode'
import * as path from 'path'

import { Config } from "../../../src/config";
import { TestSuiteManager } from "../../../src/testSuiteManager";
import { FrameworkProcess } from '../../../src/frameworkProcess';
import { Status, TestStatus } from '../../../src/testStatus';

import { logger, testItemCollectionMatches, TestItemExpectation } from "../helpers";

// JSON Fixtures
import rspecDryRunOutput from '../../fixtures/unitTests/rspec/dryRunOutput.json'
import rspecTestRunOutput from '../../fixtures/unitTests/rspec/testRunOutput.json'
import minitestDryRunOutput from '../../fixtures/unitTests/minitest/dryRunOutput.json'
import minitestTestRunOutput from '../../fixtures/unitTests/minitest/testRunOutput.json'

const log = logger("off")
const cancellationTokenSource = new vscode.CancellationTokenSource()

suite('FrameworkProcess', function () {
  let manager: TestSuiteManager
  let testController: vscode.TestController
  let frameworkProcess: FrameworkProcess
  let spawnOptions: childProcess.SpawnOptions = {}

  const config = mock<Config>()

  afterEach(function() {
    if (testController) {
      testController.dispose()
    }
  })

  suite('#parseAndHandleTestOutput()', function () {
    suite('RSpec output', function () {
      before(function () {
        let relativeTestPath = "spec"
        when(config.getRelativeTestDirectory()).thenReturn(relativeTestPath)
        when(config.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
      })

      beforeEach(function () {
        testController = vscode.tests.createTestController('ruby-test-explorer-tests', 'Ruby Test Explorer');
        manager = new TestSuiteManager(log, testController, instance(config))
        frameworkProcess = new FrameworkProcess(log, "testCommand", spawnOptions, cancellationTokenSource.token, manager)
      })

      const expectedTests: TestItemExpectation[] = [
        {
          id: "abs_spec.rb",
          //label: "Abs",
          label: "abs_spec.rb",
          file: path.resolve("spec", "abs_spec.rb"),
          canResolveChildren: true,
          children: [
            {
              id: "abs_spec.rb[1:1]",
              label: "finds the absolute value of 1",
              file: path.resolve("spec", "abs_spec.rb"),
              line: 3,
            },
            {
              id: "abs_spec.rb[1:2]",
              label: "finds the absolute value of 0",
              file: path.resolve("spec", "abs_spec.rb"),
              line: 7,
            },
            {
              id: "abs_spec.rb[1:3]",
              label: "finds the absolute value of -1",
              file: path.resolve("spec", "abs_spec.rb"),
              line: 11,
            }
          ]
        },
        {
          id: "contexts_spec.rb",
          //label: "Contexts",
          label: "contexts_spec.rb",
          file: path.resolve("spec", "contexts_spec.rb"),
          canResolveChildren: true,
          children: [
            {
              id: "contexts_spec.rb[1:1]",
              //label: "when",
              label: "contexts_spec.rb[1:1]",
              file: path.resolve("spec", "contexts_spec.rb"),
              canResolveChildren: true,
              children: [
                {
                  id: "contexts_spec.rb[1:1:1]",
                  //label: "there",
                  label: "contexts_spec.rb[1:1:1]",
                  file: path.resolve("spec", "contexts_spec.rb"),
                  canResolveChildren: true,
                  children: [
                    {
                      id: "contexts_spec.rb[1:1:1:1]",
                      //label: "are",
                      label: "contexts_spec.rb[1:1:1:1]",
                      file: path.resolve("spec", "contexts_spec.rb"),
                      canResolveChildren: true,
                      children: [
                        {
                          id: "contexts_spec.rb[1:1:1:1:1]",
                          //label: "many",
                          label: "contexts_spec.rb[1:1:1:1:1]",
                          file: path.resolve("spec", "contexts_spec.rb"),
                          canResolveChildren: true,
                          children: [
                            {
                              id: "contexts_spec.rb[1:1:1:1:1:1]",
                              //label: "levels",
                              label: "contexts_spec.rb[1:1:1:1:1:1]",
                              file: path.resolve("spec", "contexts_spec.rb"),
                              canResolveChildren: true,
                              children: [
                                {
                                  id: "contexts_spec.rb[1:1:1:1:1:1:1]",
                                  //label: "of",
                                  label: "contexts_spec.rb[1:1:1:1:1:1:1]",
                                  file: path.resolve("spec", "contexts_spec.rb"),
                                  canResolveChildren: true,
                                  children: [
                                    {
                                      id: "contexts_spec.rb[1:1:1:1:1:1:1:1]",
                                      //label: "nested",
                                      label: "contexts_spec.rb[1:1:1:1:1:1:1:1]",
                                      file: path.resolve("spec", "contexts_spec.rb"),
                                      canResolveChildren: true,
                                      children: [
                                        {
                                          id: "contexts_spec.rb[1:1:1:1:1:1:1:1:1]",
                                          //label: "contexts",
                                          label: "contexts_spec.rb[1:1:1:1:1:1:1:1:1]",
                                          file: path.resolve("spec", "contexts_spec.rb"),
                                          canResolveChildren: true,
                                          children: [
                                            {
                                              id: "contexts_spec.rb[1:1:1:1:1:1:1:1:1:1]",
                                              //label: "doesn't break the extension",
                                              label: "when there are many levels of nested contexts doesn't break the extension",
                                              file: path.resolve("spec", "contexts_spec.rb"),
                                              canResolveChildren: false,
                                              line: 13,
                                            },
                                          ]
                                        },
                                      ]
                                    },
                                  ]
                                },
                              ]
                            },
                          ]
                        },
                        {
                          id: "contexts_spec.rb[1:1:1:1:2]",
                          //label: "fewer levels of nested contexts",
                          label: "contexts_spec.rb[1:1:1:1:2]",
                          file: path.resolve("spec", "contexts_spec.rb"),
                          canResolveChildren: true,
                          children: [
                            {
                              id: "contexts_spec.rb[1:1:1:1:2:1]",
                              label: "when there are fewer levels of nested contexts test #1",
                              file: path.resolve("spec", "contexts_spec.rb"),
                              canResolveChildren: false,
                              line: 23
                            },
                          ]
                        },
                      ]
                    },
                  ]
                },
              ]
            }
          ]
        },
        {
          id: "square",
          label: "square",
          file: path.resolve("spec", "square"),
          canResolveChildren: true,
          children: [
            {
              id: "square/square_spec.rb",
              //label: "Square",
              label: "square_spec.rb",
              file: path.resolve("spec", "square", "square_spec.rb"),
              canResolveChildren: true,
              children: [
                {
                  id: "square/square_spec.rb[1:1]",
                  label: "finds the square of 2",
                  file: path.resolve("spec", "square", "square_spec.rb"),
                  line: 3,
                },
                {
                  id: "square/square_spec.rb[1:2]",
                  label: "finds the square of 3",
                  file: path.resolve("spec", "square", "square_spec.rb"),
                  line: 7,
                },
              ]
            }
          ]
        },
      ]

      test('parses dry run output correctly', function () {
        const output = `START_OF_TEST_JSON${JSON.stringify(rspecDryRunOutput)}END_OF_TEST_JSON`
        frameworkProcess['parseAndHandleTestOutput'](output)
        testItemCollectionMatches(testController.items, expectedTests)
      })

      test('parses test run output correctly', function () {
        const output = `START_OF_TEST_JSON${JSON.stringify(rspecTestRunOutput)}END_OF_TEST_JSON`
        frameworkProcess['parseAndHandleTestOutput'](output)
        testItemCollectionMatches(testController.items, expectedTests)
      })
    })

    suite('Minitest output - dry run', function () {
      before(function () {
        let relativeTestPath = "test"
        when(config.getRelativeTestDirectory()).thenReturn(relativeTestPath)
        when(config.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
      })

      beforeEach(function () {
        testController = vscode.tests.createTestController('ruby-test-explorer-tests', 'Ruby Test Explorer');
        manager = new TestSuiteManager(log, testController, instance(config))
        frameworkProcess = new FrameworkProcess(log, "testCommand", spawnOptions, cancellationTokenSource.token, manager)
      })



      const expectedTests: TestItemExpectation[] = [
        {
          id: "square",
          label: "square",
          file: path.resolve("test", "square"),
          canResolveChildren: true,
          children: [
            {
              id: "square/square_test.rb",
              //label: "Square",
              label: "square_test.rb",
              file: path.resolve("test", "square", "square_test.rb"),
              canResolveChildren: true,
              children: [
                {
                  id: "square/square_test.rb[4]",
                  label: "square 2",
                  file: path.resolve("test", "square", "square_test.rb"),
                  line: 3,
                },
                {
                  id: "square/square_test.rb[8]",
                  label: "square 3",
                  file: path.resolve("test", "square", "square_test.rb"),
                  line: 7,
                },
              ]
            }
          ]
        },
        {
          id: "abs_test.rb",
          //label: "Abs",
          label: "abs_test.rb",
          file: path.resolve("test", "abs_test.rb"),
          canResolveChildren: true,
          children: [
            {
              id: "abs_test.rb[4]",
              label: "abs positive",
              file: path.resolve("test", "abs_test.rb"),
              line: 3,
            },
            {
              id: "abs_test.rb[8]",
              label: "abs 0",
              file: path.resolve("test", "abs_test.rb"),
              line: 7,
            },
            {
              id: "abs_test.rb[12]",
              label: "abs negative",
              file: path.resolve("test", "abs_test.rb"),
              line: 11,
            }
          ]
        },
      ]

      test('parses dry run output correctly', function () {
        const output = `START_OF_TEST_JSON${JSON.stringify(minitestDryRunOutput)}END_OF_TEST_JSON`
        frameworkProcess['parseAndHandleTestOutput'](output)
        testItemCollectionMatches(testController.items, expectedTests)
      })

      test('parses test run output correctly', function () {
        const output = `START_OF_TEST_JSON${JSON.stringify(minitestTestRunOutput)}END_OF_TEST_JSON`
        frameworkProcess['parseAndHandleTestOutput'](output)
        testItemCollectionMatches(testController.items, expectedTests)
      })
    })
  })

  suite('error handling', function() {
    let tmpDir: string | undefined
    let mockLog: IChildLogger
    let mockTestManager: TestSuiteManager
    let cancellationTokenSource = new vscode.CancellationTokenSource()

    before(async function() {
      // Create temp dir in which to put scripts
      try {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ruby-test-adapter-'));
      } catch (err) {
        console.error(err);
      }
    });

    after(async function() {
      // Delete temp dir and all that's in it
      if (tmpDir) {
        try {
          await fs.rm(tmpDir, { recursive: true, force: true });
        } catch (err) {
          console.error(err);
        }
      }
    })

    beforeEach(function() {
      mockLog = mock<IChildLogger>()
      when(mockLog.getChildLogger(anything())).thenReturn(instance(mockLog))
      mockTestManager = mock<TestSuiteManager>()
    });

    let echo = (content: string, channel: string = 'stdout'): string => {
      let command = 'echo'
      if (os.platform() == 'win32' && content.length == 0) {
        command = `${command}.`
      } else {
        command = `${command} "${content}"`
      }
      if (channel == 'stderr') {
        return `${command} 1>&2`
      }
      return command
    }

    let shellCommand = (): string => {
      if (os.platform() == 'win32') {
        return 'cmd'
      } else {
        return 'sh'
      }
    }

    let scriptName = (name: string): string => {
      if (os.platform() == 'win32') {
        return `${name}.bat`
      } else {
        return `${name}.sh`
      }
    }

    let runCommand = async (
      name: string,
      content: string[],
      statusListener?: (e: TestStatus) => any,
      exitCode: number = 0,
      onDebugStarted?: () => any) => {
      if (tmpDir) {
        let script = scriptName(name)
        let scriptPath = path.join(tmpDir, script)
        let scriptFile = await fs.open(scriptPath, 'w+')
        try {
          content.push(`exit ${exitCode}`)
          await scriptFile.writeFile(content.join("\n"))
          await scriptFile.sync()
        } finally {
          await scriptFile.close()
        }

        let command = shellCommand()

        let spawnArgs = {
          cwd: tmpDir,
          env: process.env
        }

        let fp = new FrameworkProcess(
          instance(mockLog), command, spawnArgs, cancellationTokenSource.token, instance(mockTestManager)
        )
        let listenerDisposable: vscode.Disposable | undefined = undefined
        if (statusListener) {
          listenerDisposable = fp.testStatusEmitter.event(statusListener)
        }
        try {
          return await fp.startProcess([script], onDebugStarted)
        } finally {
          if (listenerDisposable) {
            listenerDisposable.dispose()
          }
          fp.dispose()
        }
      } else {
        throw new Error("Missing temp directory for test script")
      }
    }

    suite('when command has a non-zero exit code', function() {
      test('with stdout message', async function() {
        const message = [
          'The tests will not work :(',
          'You won\'t go to space today',
          'Install dependencies'
        ]
        let statusMessageCount = 0;
        let exitCode = 1;

        try {
          await runCommand('non-zero-stdout', message.map(x => echo(x)), (_) => {statusMessageCount++}, exitCode)
        } catch (err) {
          expect((err as Error).message).to.eq(`Child process exited abnormally. Status code: ${exitCode}`)
        }

        const [logMessage, logData] = capture(mockLog.error).last();
        expect(logMessage).to.eq('Test process failed to run')
        expect(logData).to.eql({ message: message })
        expect(statusMessageCount).to.eq(0)
      });

      test('with stderr message', async function() {
        const message = [
          'What happen?',
          'Someone set us up the bomb!',
          'We get signal',
          'Main screen turn on'
        ]
        let statusMessageCount = 0;
        let exitCode = 10;

        try {
          await runCommand('non-zero-stderr', message.map(x => echo(x, 'stderr')), (_) => {statusMessageCount++}, exitCode)
        } catch (err) {
          expect((err as Error).message).to.eq(`Child process exited abnormally. Status code: ${exitCode}`)
        }

        const [logMessage, logData] = capture(mockLog.error).last();
        expect(logMessage).to.eq('Test process failed to run')
        expect(logData).to.eql({ message: message })
        expect(statusMessageCount).to.eq(0)
      });
    });

    suite('when command has a zero exit code', function() {
      test('with stdout message', async function() {
        const messages = [
          'This should be ignored',
          'RUNNING: with scissors',
          'PANIC: at the disco',
          'PASSED: in the roller rink'
        ]
        let statusMessageCount = 0;
        let exitCode = 0;
        let testItem = testController.createTestItem("with scissors", "with scissors")
        when(mockTestManager.getOrCreateTestItem(anything())).thenReturn(testItem)

        try {
          await runCommand('zero-stdout', messages.map(x => echo(x)), (_) => {statusMessageCount++}, exitCode)
        } catch (err) {
          expect((err as Error).message).to.eq(`Child process exited abnormally. Status code: ${exitCode}`)
        }

        verify(mockLog.error(anything(), anything())).times(0)
        verify(mockLog.info(anything(), anything())).times(2)
        const [logMessage1, logData1] = capture(mockLog.info).first();
        const [logMessage2, logData2] = capture(mockLog.info).last();

        expect(logMessage1).to.eq('Test run started - stopped capturing error output')
        expect(logData1).to.eql({ event: new TestStatus(testItem, Status.running) })
        expect(logMessage2).to.eq('stdout: %s')
        expect(logData2).to.eql('PANIC: at the disco')
        expect(statusMessageCount).to.eq(2)
      });

      test('with stderr message', async function() {
        const stdoutMessages = [
          'This should be ignored',
          'RUNNING: with scissors',
          'PANIC: at the disco',
          'PASSED: in the roller rink'
        ]
        const stderrMessage = "Fast Debugger - the debugger of tomorrow, today!"

        let statusMessageCount = 0;
        let debugStarted = false
        let exitCode = 0;
        let testItem = testController.createTestItem("with scissors", "with scissors")
        when(mockTestManager.getOrCreateTestItem(anything())).thenReturn(testItem)

        const scriptContent = [echo(stderrMessage, 'stderr')]
        for (const line of stdoutMessages) scriptContent.push(echo(line))
        try {
          await runCommand('zero-stdout', scriptContent, (_) => {statusMessageCount++}, exitCode, () => {debugStarted = true})
        } catch (err) {
          expect((err as Error).message).to.eq(`Child process exited abnormally. Status code: ${exitCode}`)
        }

        verify(mockLog.error(anything(), anything())).times(0)
        verify(mockLog.info(anything())).times(1)
        verify(mockLog.info(anything(), anything())).times(2)
        const [logMessage1, logData1] = capture(mockLog.info).first();
        const [logMessage2, logData2] = capture(mockLog.info).second();
        const [logMessage3, logData3] = capture(mockLog.info).last();
        let logMessages = [logMessage1, logMessage2, logMessage3]
        let logData = [logData1, logData2, logData3]

        let expectedLogMessages = [
          'Notifying debug session that test process is ready to debug',
          'Test run started - stopped capturing error output',
          'stdout: %s'
        ]
        for (const logMessage of logMessages) {
          expect(expectedLogMessages.includes(logMessage))
            .to.eq(true, `log message "${logMessage}" not found`)
        }
        for (const data of logData) {
          if (typeof data == "string") {
            expect(data).to.eq('PANIC: at the disco')
          } else if (data) {
            expect(data).to.eql({ event: new TestStatus(testItem, Status.running) })
          }
        }
        expect(expectedLogMessages.includes(logMessage2)).to.eq(true, 'second log message')
        expect(expectedLogMessages.includes(logMessage3)).to.eq(true, 'third log message')

        expect(statusMessageCount).to.eq(2)
        expect(debugStarted).to.eq(true)
      });
    });
  })
})
