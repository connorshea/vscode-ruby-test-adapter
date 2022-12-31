import * as vscode from 'vscode';
import * as path from 'path'
import { anything, instance, verify } from 'ts-mockito'
import { expect } from 'chai';

import { TestLoader } from '../../../src/testLoader';
import { TestSuite } from '../../../src/testSuite';
import { RspecTestRunner } from '../../../src/rspec/rspecTestRunner';
import { RspecConfig } from '../../../src/rspec/rspecConfig';

import { noop_logger, stdout_logger, setupMockRequest, testItemCollectionMatches, testItemMatches, testStateCaptors, verifyFailure } from '../helpers';
import { StubTestController } from '../../stubs/stubTestController';

suite('Extension Test for RSpec', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]
  let config: RspecConfig
  let testRunner: RspecTestRunner;
  let testLoader: TestLoader;
  let testSuite: TestSuite;

  let expectedPath = (file: string): string => {
    return path.resolve(
      'test',
      'fixtures',
      'rspec',
      'spec',
      file)
  }

  this.beforeAll(function() {
    vscode.workspace.getConfiguration('rubyTestExplorer').update('rspecDirectory', 'spec')
    vscode.workspace.getConfiguration('rubyTestExplorer').update('filePattern', ['*_spec.rb'])
    config = new RspecConfig(path.resolve("ruby"), workspaceFolder)
  })

  suite('dry run', function() {
    this.beforeEach(function () {
      testController = new StubTestController()
      testSuite = new TestSuite(noop_logger(), testController, config)
      testRunner = new RspecTestRunner(noop_logger(), workspaceFolder, testController, config, testSuite)
      testLoader = new TestLoader(stdout_logger(), testController, testRunner, config, testSuite);
    })

    test('Load tests on file resolve request', async function () {
      // Populate controller with test files. This would be done by the filesystem globs in the watchers
      let createTest = (id: string, label?: string) =>
      testController.createTestItem(id, label || id, vscode.Uri.file(expectedPath(id)))
      testController.items.add(createTest("abs_spec.rb"))
      testController.items.add(createTest("square_spec.rb"))
      let subfolderItem = createTest("subfolder")
      testController.items.add(subfolderItem)
      subfolderItem.children.add(createTest("subfolder/foo_spec.rb", "foo_spec.rb"))

      // No tests in suite initially, only test files and folders
      testItemCollectionMatches(testController.items,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            label: "abs_spec.rb",
            children: []
          },
          {
            file: expectedPath("square_spec.rb"),
            id: "square_spec.rb",
            label: "square_spec.rb",
            children: []
          },
          {
            file: expectedPath("subfolder"),
            id: "subfolder",
            label: "subfolder",
            children: [
              {
                file: expectedPath(path.join("subfolder", "foo_spec.rb")),
                id: "subfolder/foo_spec.rb",
                label: "foo_spec.rb",
                children: []
              }
            ]
          },
        ]
      )

      // Resolve a file (e.g. by clicking on it in the test explorer)
      await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_spec.rb")))

      // Tests in that file have now been added to suite
      testItemCollectionMatches(testController.items,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            label: "abs_spec.rb",
            children: [
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:1]",
                label: "finds the absolute value of 1",
                line: 3,
              },
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:2]",
                label: "finds the absolute value of 0",
                line: 7,
              },
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:3]",
                label: "finds the absolute value of -1",
                line: 11,
              }
            ]
          },
          {
            file: expectedPath("square_spec.rb"),
            id: "square_spec.rb",
            label: "square_spec.rb",
            children: []
          },
          {
            file: expectedPath("subfolder"),
            id: "subfolder",
            label: "subfolder",
            children: [
              {
                file: expectedPath(path.join("subfolder", "foo_spec.rb")),
                id: "subfolder/foo_spec.rb",
                label: "foo_spec.rb",
                children: []
              }
            ]
          },
        ]
      )
    })

    test('Load all tests', async function () {
      await testLoader.discoverAllFilesInWorkspace()

      const testSuite = testController.items

      testItemCollectionMatches(testSuite,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            label: "abs_spec.rb",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:1]",
                label: "finds the absolute value of 1",
                line: 3,
              },
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:2]",
                label: "finds the absolute value of 0",
                line: 7,
              },
              {
                file: expectedPath("abs_spec.rb"),
                id: "abs_spec.rb[1:3]",
                label: "finds the absolute value of -1",
                line: 11,
              }
            ]
          },
          {
            file: expectedPath("square_spec.rb"),
            id: "square_spec.rb",
            label: "square_spec.rb",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("square_spec.rb"),
                id: "square_spec.rb[1:1]",
                label: "finds the square of 2",
                line: 3,
              },
              {
                file: expectedPath("square_spec.rb"),
                id: "square_spec.rb[1:2]",
                label: "finds the square of 3",
                line: 7,
              }
            ]
          },
          {
            file: expectedPath("subfolder"),
            id: "subfolder",
            label: "subfolder",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath(path.join("subfolder", "foo_spec.rb")),
                id: "subfolder/foo_spec.rb",
                label: "foo_spec.rb",
                canResolveChildren: true,
                children: [
                  {
                    file: expectedPath(path.join("subfolder", "foo_spec.rb")),
                    id: "subfolder/foo_spec.rb[1:1]",
                    label: "wibbles and wobbles",
                    line: 3,
                  }
                ]
              }
            ]
          },
        ]
      )
    })
  })

  suite('status events', function() {
    let cancellationTokenSource = new vscode.CancellationTokenSource()

    suite('dry run before test run', function() {
      this.beforeAll(async function () {
        testController = new StubTestController()
        testSuite = new TestSuite(noop_logger(), testController, config)
        testRunner = new RspecTestRunner(noop_logger(), workspaceFolder, testController, config, testSuite)
        testLoader = new TestLoader(noop_logger(), testController, testRunner, config, testSuite);
        await testLoader.discoverAllFilesInWorkspace()
      })

      suite('file with passing and failing specs', function() {
        let mockTestRun: vscode.TestRun

        this.beforeAll(async function() {
          let mockRequest = setupMockRequest(testSuite, "square_spec.rb")
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun()
        })

        test('enqueued status event', async function() {
          // Not really a useful status event unless you can queue up tests and run only
          // parts of the queue at a time - perhaps in the future
          verify(mockTestRun.enqueued(anything())).times(0)
        })

        test('started status event', function() {
          let args = testStateCaptors(mockTestRun)

          // Assert that all specs and the file are marked as started
          expect(args.startedArg(0).id).to.eq("square_spec.rb")
          expect(args.startedArg(1).id).to.eq("square_spec.rb[1:1]")
          expect(args.startedArg(2).id).to.eq("square_spec.rb[1:2]")
          verify(mockTestRun.started(anything())).times(3)
        })

        test('passed status event', function() {
          let expectedTestItem = {
            id: "square_spec.rb[1:1]",
            file: expectedPath("square_spec.rb"),
            label: "finds the square of 2",
            line: 3
          }

          // Verify that passed status event occurred exactly twice (once as soon as it
          // passed and again when parsing the test run output)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(0).testItem,
                          expectedTestItem)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(1).testItem,
                          expectedTestItem)
          verify(mockTestRun.passed(anything(), anything())).times(2)

          // Expect failed status events for the other spec in the file
          verify(mockTestRun.failed(anything(), anything(), anything())).times(2)

          // Verify that no other status events occurred
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('failure status event', function() {
          let expectedTestItem = {
            id: "square_spec.rb[1:2]",
            file: expectedPath("square_spec.rb"),
            label: "finds the square of 3",
            line: 7
          }

          // Verify that failed status event occurred twice - once immediately after the
          // test failed with no details, and once at the end when parsing test output with
          // more information
          verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, {
            testItem: expectedTestItem,
          })
          verifyFailure(1, testStateCaptors(mockTestRun).failedArgs, {
            testItem: expectedTestItem,
            message: "RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n",
            line: 8,
          })
          verify(mockTestRun.failed(anything(), anything(), anything())).times(2)

          // Expect passed status events for the other spec in the file
          verify(mockTestRun.passed(anything(), anything())).times(2)

          // Verify that no other status events occurred
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })
      })

      suite('single specs from file with passing, skipped and errored specs', async function() {
        let mockTestRun: vscode.TestRun

        test('single passing spec', async function() {
          let mockRequest = setupMockRequest(testSuite, "abs_spec.rb[1:1]")
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun()

          let expectedTestItem = {
            id: "abs_spec.rb[1:1]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of 1",
            line: 3
          }

          // Verify that passed status event occurred exactly twice (once as soon as it
          // passed and again when parsing the test run output)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(0).testItem,
                          expectedTestItem)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(1).testItem,
                          expectedTestItem)
          verify(mockTestRun.passed(anything(), anything())).times(2)
          expect(testStateCaptors(mockTestRun).startedArg(0).id).to.eq(expectedTestItem.id)
          verify(mockTestRun.started(anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.enqueued(anything())).times(0)
          verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('single spec with error', async function() {
          let mockRequest = setupMockRequest(testSuite, "abs_spec.rb[1:2]")
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun()

          let expectedTestItem = {
            id: "abs_spec.rb[1:2]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of 0",
            line: 7
          }

          // Verify that failed status event occurred twice - once immediately after the
          // test failed with no details, and once at the end when parsing test output with
          // more information
          verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, {
            testItem: expectedTestItem,
          })
          verifyFailure(0, testStateCaptors(mockTestRun).erroredArgs, {
            testItem: expectedTestItem,
            message: "RuntimeError:\nAbs for zero is not supported",
            line: 8,
          })
          verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
          expect(testStateCaptors(mockTestRun).startedArg(0).id).to.eq(expectedTestItem.id)
          verify(mockTestRun.started(anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.enqueued(anything())).times(0)
          verify(mockTestRun.passed(anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('single skipped spec', async function() {
          let mockRequest = setupMockRequest(testSuite, "abs_spec.rb[1:3]")
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun()

          let args = testStateCaptors(mockTestRun)
          let expectation = {
            id: "abs_spec.rb[1:3]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of -1",
            line: 11
          }
          testItemMatches(args.skippedArg(0), expectation)

          // Verify that only expected status events occurred
          verify(mockTestRun.enqueued(anything())).times(1)
          verify(mockTestRun.started(anything())).times(1)
          verify(mockTestRun.skipped(anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.passed(anything(), anything())).times(0)
          verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
        })
      })
    })

    suite('test run without dry run', function () {
      this.beforeAll(function () {
        testController = new StubTestController()
        testSuite = new TestSuite(stdout_logger(), testController, config)
        testRunner = new RspecTestRunner(stdout_logger(), workspaceFolder, testController, config, testSuite)
        testLoader = new TestLoader(noop_logger(), testController, testRunner, config, testSuite);
      })

      suite('file with passing and failing specs', function() {
        let mockTestRun: vscode.TestRun

        this.beforeAll(async function() {
          let request = instance(setupMockRequest(testSuite, "square_spec.rb"))
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun()
        })

        test('enqueued status event', async function() {
          // Not really a useful status event unless you can queue up tests and run only
          // parts of the queue at a time - perhaps in the future
          verify(mockTestRun.enqueued(anything())).times(0)
        })

        test('started status event', function() {
          let args = testStateCaptors(mockTestRun)

          // Assert that all specs and the file are marked as started
          expect(args.startedArg(0).id).to.eq("square_spec.rb")
          verify(mockTestRun.started(anything())).times(1)
        })

        test('passed status event', function() {
          let expectedTestItem = {
            id: "square_spec.rb[1:1]",
            file: expectedPath("square_spec.rb"),
            label: "finds the square of 2",
            line: 3
          }

          // Verify that passed status event occurred exactly twice (once as soon as it
          // passed and again when parsing the test run output)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(0).testItem,
                          expectedTestItem)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(1).testItem,
                          expectedTestItem)
          verify(mockTestRun.passed(anything(), anything())).times(2)

          // Expect failed status events for the other spec in the file
          verify(mockTestRun.failed(anything(), anything(), anything())).times(2)

          // Verify that no other status events occurred
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('failure status event', function() {
          let expectedTestItem = {
            id: "square_spec.rb[1:2]",
            file: expectedPath("square_spec.rb"),
            label: "finds the square of 3",
            line: 7
          }

          // Verify that failed status event occurred twice - once immediately after the
          // test failed with no details, and once at the end when parsing test output with
          // more information
          verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, {
            testItem: expectedTestItem,
          })
          verifyFailure(1, testStateCaptors(mockTestRun).failedArgs, {
            testItem: expectedTestItem,
            message: "RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n",
            line: 8,
          })
          verify(mockTestRun.failed(anything(), anything(), anything())).times(2)

          // Expect passed status events for the other spec in the file
          verify(mockTestRun.passed(anything(), anything())).times(2)

          // Verify that no other status events occurred
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })
      })

      suite('single specs from file with passing, skipped and errored specs', async function() {
        test('passing spec', async function() {
          let errorRequest = instance(setupMockRequest(testSuite, "abs_spec.rb[1:1]"))

          await testRunner.runHandler(errorRequest, cancellationTokenSource.token)
          let mockTestRun = (testController as StubTestController).getMockTestRun()

          let expectedTestItem = {
            id: "abs_spec.rb[1:1]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of 1",
            line: 3,
          }
          // Verify that passed status event occurred exactly once (once as soon as it
          // passed and again when parsing the test run output)
          testItemMatches(testStateCaptors(mockTestRun).passedArg(0).testItem,
                          expectedTestItem)

          // Verify that only expected status events occurred
          verify(mockTestRun.started(anything())).times(1)
          verify(mockTestRun.passed(anything(), anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
          verify(mockTestRun.enqueued(anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('errored spec', async function() {
          let errorRequest = instance(setupMockRequest(testSuite, "abs_spec.rb[1:2]"))

          await testRunner.runHandler(errorRequest, cancellationTokenSource.token)
          let mockTestRun = (testController as StubTestController).getMockTestRun()

          let expectedTestItem = {
            id: "abs_spec.rb[1:2]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of 0",
            line: 7,
          }
          // Verify that failed status occurred immediately and error status event occurred
          // when parsing test output with more information
          // verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, {
          //   testItem: expectedTestItem,
          // })
          verifyFailure(0, testStateCaptors(mockTestRun).erroredArgs, {
            testItem: expectedTestItem,
            message: "RuntimeError:\nAbs for zero is not supported",
            line: 8,
          })

          // Verify that only expected status events occurred
          verify(mockTestRun.started(anything())).times(1)
          //verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
          verify(mockTestRun.enqueued(anything())).times(0)
          verify(mockTestRun.passed(anything(), anything())).times(0)
          verify(mockTestRun.skipped(anything())).times(0)
        })

        test('skipped spec', async function() {
          let skippedRequest = instance(setupMockRequest(testSuite, "abs_spec.rb[1:3]"))
          await testRunner.runHandler(skippedRequest, cancellationTokenSource.token)

          let mockTestRun = (testController as StubTestController).getMockTestRun()

          let args = testStateCaptors(mockTestRun)
          let expectation = {
            id: "abs_spec.rb[1:3]",
            file: expectedPath("abs_spec.rb"),
            label: "finds the absolute value of -1",
            line: 11
          }
          testItemMatches(args.startedArg(0), expectation)
          testItemMatches(args.skippedArg(0), expectation)

          // Verify that only expected status events occurred
          verify(mockTestRun.started(anything())).times(1)
          verify(mockTestRun.skipped(anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.enqueued(anything())).times(0)
          verify(mockTestRun.passed(anything(), anything())).times(0)
          verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
          verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
        })
      })
    })
  })
});
