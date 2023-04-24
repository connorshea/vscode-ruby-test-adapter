import * as vscode from 'vscode';
import * as path from 'path'
import { anything, instance, mock, reset, verify, when } from '@typestrong/ts-mockito'
import { after, before, beforeEach } from 'mocha';
import { expect } from 'chai';

import { TestLoader } from '../../../src/testLoader';
import { TestSuiteManager } from '../../../src/testSuiteManager';
import { TestRunner } from '../../../src/testRunner';
import { RspecConfig } from '../../../src/rspec/rspecConfig';

import {
  logger,
  setupMockRequest,
  testItemCollectionMatches,
  testItemMatches,
  testStateCaptors,
  verifyFailure,
  TestItemExpectation,
  TestFailureExpectation
} from '../helpers';

suite('Extension Test for RSpec', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]
  let config: RspecConfig
  let testRunner: TestRunner;
  let testLoader: TestLoader;
  let manager: TestSuiteManager;
  let mockTestRun: vscode.TestRun;
  let cancellationTokenSource: vscode.CancellationTokenSource;

  const log = logger("off");

  let expectedPath = (file: string): string => {
    return path.resolve(
      'test',
      'fixtures',
      'rspec',
      'spec',
      file)
  }

  let abs_positive_expectation = {
    file: expectedPath("abs_spec.rb"),
    id: "abs_spec.rb[1:1]",
    label: "finds the absolute value of 1",
    line: 3,
  }
  let abs_zero_expectation = {
    file: expectedPath("abs_spec.rb"),
    id: "abs_spec.rb[1:2]",
    label: "finds the absolute value of 0",
    line: 7,
  }
  let abs_negative_expectation = {
    file: expectedPath("abs_spec.rb"),
    id: "abs_spec.rb[1:3]",
    label: "finds the absolute value of -1",
    line: 11,
  }
  let square_2_expectation = {
    file: expectedPath("square/square_spec.rb"),
    id: "square/square_spec.rb[1:1]",
    label: "finds the square of 2",
    line: 3,
  }
  let square_3_expectation = {
    file: expectedPath("square/square_spec.rb"),
    id: "square/square_spec.rb[1:2]",
    label: "finds the square of 3",
    line: 7,
  }
  let contexts_many_expectation = {
    file: expectedPath('contexts_spec.rb'),
    id: 'contexts_spec.rb[1:1:1:1:1:1:1:1:1:1]',
    //label: "doesn't break the extension",
    label: "when there are many levels of nested contexts doesn't break the extension",
    line: 13,
  }
  let contexts_fewer_expectation = {
    file: expectedPath('contexts_spec.rb'),
    id: 'contexts_spec.rb[1:1:1:1:2:1]',
    label: "when there are fewer levels of nested contexts test #1",
    line: 23,
  }

  before(function() {
    vscode.workspace.getConfiguration('rubyTestExplorer').update('rspecDirectory', 'spec')
    vscode.workspace.getConfiguration('rubyTestExplorer').update('filePattern', ['*_spec.rb'])
    config = new RspecConfig(path.resolve("ruby"), workspaceFolder)

    testController = vscode.tests.createTestController('ruby-test-explorer-tests', 'Ruby Test Explorer')
    mockTestRun = mock<vscode.TestRun>()
    cancellationTokenSource = new vscode.CancellationTokenSource()
    testController.createTestRun = (_: vscode.TestRunRequest, name?: string): vscode.TestRun => {
      when(mockTestRun.name).thenReturn(name)
      when(mockTestRun.token).thenReturn(cancellationTokenSource.token)
      return instance(mockTestRun)
    }

    manager = new TestSuiteManager(log, testController, config)
    testRunner = new TestRunner(log, manager, workspaceFolder)
    testLoader = new TestLoader(log, manager, testRunner);
  })

  beforeEach(function() {
    reset(mockTestRun)
  });

  after(function() {
    testController.dispose()
    cancellationTokenSource.dispose()
  })

  suite('dry run', function() {
    beforeEach(function () {
      testController.items.replace([])
    })

    test('Load tests on file resolve request', async function () {
      // Populate controller with test files. This would be done by the filesystem globs in the watchers
      let createTest = (id: string, canResolveChildren: boolean, label?: string) => {
        let item = testController.createTestItem(id, label || id, vscode.Uri.file(expectedPath(id)))
        item.canResolveChildren = canResolveChildren
        return item
      }
      let absSpecItem = createTest("abs_spec.rb", true)
      testController.items.add(absSpecItem)
      let contextsSpecItem = createTest("contexts_spec.rb", true)
      testController.items.add(contextsSpecItem)
      let subfolderItem = createTest("square", true)
      testController.items.add(subfolderItem)
      subfolderItem.children.add(createTest("square/square_spec.rb", true, "square_spec.rb"))

      // No tests in suite initially, just test files and folders
      testItemCollectionMatches(testController.items,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            label: "abs_spec.rb",
            canResolveChildren: true,
            children: []
          },
          {
            file: expectedPath("contexts_spec.rb"),
            id: "contexts_spec.rb",
            label: "contexts_spec.rb",
            canResolveChildren: true,
            children: []
          },
          {
            file: expectedPath("square"),
            id: "square",
            label: "square",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("square/square_spec.rb"),
                id: "square/square_spec.rb",
                label: "square_spec.rb",
                canResolveChildren: true,
                children: []
              },
            ]
          },
        ]
      )

      // Resolve a file (e.g. by clicking on it in the test explorer)
      await testLoader.loadTestItem(absSpecItem)

      // Tests in that file have now been added to suite
      testItemCollectionMatches(testController.items,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            label: "abs_spec.rb",
            canResolveChildren: true,
            children: [
              abs_positive_expectation,
              abs_zero_expectation,
              abs_negative_expectation
            ]
          },
          {
            file: expectedPath("contexts_spec.rb"),
            id: "contexts_spec.rb",
            label: "contexts_spec.rb",
            canResolveChildren: true,
            children: []
          },
          {
            file: expectedPath("square"),
            id: "square",
            label: "square",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("square/square_spec.rb"),
                id: "square/square_spec.rb",
                label: "square_spec.rb",
                canResolveChildren: true,
                children: []
              },
            ]
          },
        ]
      )
    })

    test('Load all tests', async function () {
      await testLoader['loadTests']()

      const manager = testController.items

      testItemCollectionMatches(manager,
        [
          {
            file: expectedPath("abs_spec.rb"),
            id: "abs_spec.rb",
            //label: "Abs",
            label: "abs_spec.rb",
            canResolveChildren: true,
            children: [
              abs_positive_expectation,
              abs_zero_expectation,
              abs_negative_expectation
            ]
          },
          {
            file: expectedPath("contexts_spec.rb"),
            id: "contexts_spec.rb",
            //label: "Contexts",
            label: "contexts_spec.rb",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("contexts_spec.rb"),
                id: "contexts_spec.rb[1:1]",
                //label: "when",
                label: "contexts_spec.rb[1:1]",
                canResolveChildren: true,
                children: [
                  {
                    file: expectedPath("contexts_spec.rb"),
                    id: "contexts_spec.rb[1:1:1]",
                    //label: "there",
                    label: "contexts_spec.rb[1:1:1]",
                    canResolveChildren: true,
                    children: [
                      {
                        file: expectedPath("contexts_spec.rb"),
                        id: "contexts_spec.rb[1:1:1:1]",
                        //label: "are",
                        label: "contexts_spec.rb[1:1:1:1]",
                        canResolveChildren: true,
                        children: [
                          {
                            file: expectedPath("contexts_spec.rb"),
                            id: "contexts_spec.rb[1:1:1:1:1]",
                            //label: "many",
                            label: "contexts_spec.rb[1:1:1:1:1]",
                            canResolveChildren: true,
                            children: [
                              {
                                file: expectedPath("contexts_spec.rb"),
                                id: "contexts_spec.rb[1:1:1:1:1:1]",
                                //label: "levels",
                                label: "contexts_spec.rb[1:1:1:1:1:1]",
                                canResolveChildren: true,
                                children: [
                                  {
                                    file: expectedPath("contexts_spec.rb"),
                                    id: "contexts_spec.rb[1:1:1:1:1:1:1]",
                                    //label: "of",
                                    label: "contexts_spec.rb[1:1:1:1:1:1:1]",
                                    canResolveChildren: true,
                                    children: [
                                      {
                                        file: expectedPath("contexts_spec.rb"),
                                        id: "contexts_spec.rb[1:1:1:1:1:1:1:1]",
                                        //label: "nested",
                                        label: "contexts_spec.rb[1:1:1:1:1:1:1:1]",
                                        canResolveChildren: true,
                                        children: [
                                          {
                                            file: expectedPath("contexts_spec.rb"),
                                            id: "contexts_spec.rb[1:1:1:1:1:1:1:1:1]",
                                            //label: "contexts",
                                            label: "contexts_spec.rb[1:1:1:1:1:1:1:1:1]",
                                            canResolveChildren: true,
                                            children: [
                                              contexts_many_expectation,
                                            ]
                                          }
                                        ]
                                      },
                                    ]
                                  },
                                ]
                              },
                            ]
                          },
                          {
                            file: expectedPath("contexts_spec.rb"),
                            id: "contexts_spec.rb[1:1:1:1:2]",
                            //label: "fewer levels of nested contexts",
                            label: "contexts_spec.rb[1:1:1:1:2]",
                            canResolveChildren: true,
                            children: [
                              contexts_fewer_expectation,
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            file: expectedPath("square"),
            id: "square",
            label: "square",
            canResolveChildren: true,
            children: [
              {
                file: expectedPath("square/square_spec.rb"),
                id: "square/square_spec.rb",
                //label: "Square",
                label: "square_spec.rb",
                canResolveChildren: true,
                children: [
                  square_2_expectation,
                  square_3_expectation
                ]
              }
            ]
          }
        ]
      )
    })
  })

  suite('status events', function() {
    before(async function() {
      await testLoader['loadTests']()
    })

    suite(`running collections emits correct statuses`, async function() {
      test('when running full suite', async function() {
        let mockRequest = setupMockRequest(manager)
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)

        verify(mockTestRun.enqueued(anything())).times(20)
        verify(mockTestRun.started(anything())).times(7)
        verify(mockTestRun.passed(anything(), anything())).times(8)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
        verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
        verify(mockTestRun.skipped(anything())).times(2)
      })

      test('when running all top-level items', async function() {
        let mockRequest = setupMockRequest(manager, ["abs_spec.rb", "square"])
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)

        verify(mockTestRun.enqueued(anything())).times(8)
        verify(mockTestRun.started(anything())).times(5)
        verify(mockTestRun.passed(anything(), anything())).times(4)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
        verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
        verify(mockTestRun.skipped(anything())).times(2)
      })

      test('when running all files', async function() {
        let mockRequest = setupMockRequest(manager, ["abs_spec.rb", "square/square_spec.rb"])
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)

        verify(mockTestRun.enqueued(anything())).times(7)
        // One less 'started' than the other tests as it doesn't include the 'square' folder
        verify(mockTestRun.started(anything())).times(5)
        verify(mockTestRun.passed(anything(), anything())).times(4)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
        verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
        verify(mockTestRun.skipped(anything())).times(2)
      })
    })

    suite(`running single tests emits correct statuses`, async function() {
      let params: {status: string, expectedTest: TestItemExpectation, failureExpectation?: TestFailureExpectation}[] = [
        {
          status: "passed",
          expectedTest: square_2_expectation,
        },
        {
          status: "failed",
          expectedTest: square_3_expectation,
          failureExpectation: {
            message: /RSpec::Expectations::ExpectationNotMetError:\s*expected: 9\s*got: 6/,
            line: 8,
          }
        },
        {
          status: "passed",
          expectedTest: abs_positive_expectation
        },
        {
          status: "errored",
          expectedTest: abs_zero_expectation,
          failureExpectation: {
            message: /RuntimeError:\s*Abs for zero is not supported/,
            line: 8,
          }
        },
        {
          status: "skipped",
          expectedTest: abs_negative_expectation
        }
      ]
      for(const {status, expectedTest, failureExpectation} of params) {
        test(`id: ${expectedTest.id}, status: ${status}`, async function() {
          let mockRequest = setupMockRequest(manager, expectedTest.id)
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)

          switch(status) {
            case "passed":
              testItemMatches(testStateCaptors(mockTestRun).passedArg(0).testItem, expectedTest)
              testItemMatches(testStateCaptors(mockTestRun).passedArg(1).testItem, expectedTest)
              verify(mockTestRun.passed(anything(), anything())).times(2)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
              verify(mockTestRun.skipped(anything())).times(0)
              break;
            case "failed":
              verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, expectedTest, failureExpectation!)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
              verify(mockTestRun.skipped(anything())).times(0)
              break;
            case "errored":
              verifyFailure(0, testStateCaptors(mockTestRun).erroredArgs, expectedTest, failureExpectation!)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
              verify(mockTestRun.skipped(anything())).times(0)
              break;
            case "skipped":
              testItemMatches(testStateCaptors(mockTestRun).skippedArg(0), expectedTest)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
              verify(mockTestRun.skipped(anything())).times(2)
              break;
          }
          expect(testStateCaptors(mockTestRun).startedArg(0).id).to.eq(expectedTest.id)
          verify(mockTestRun.started(anything())).times(1)
          verify(mockTestRun.enqueued(anything())).times(1)
        })
      }
    })
  })
});
