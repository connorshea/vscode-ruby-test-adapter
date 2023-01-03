import * as vscode from 'vscode';
import * as path from 'path'
import { anything, instance, verify, mock, when } from 'ts-mockito'
import { before, beforeEach } from 'mocha';
import { expect } from 'chai';

import { TestLoader } from '../../../src/testLoader';
import { TestSuite } from '../../../src/testSuite';
import { RspecTestRunner } from '../../../src/rspec/rspecTestRunner';
import { RspecConfig } from '../../../src/rspec/rspecConfig';

import { noop_logger, stdout_logger, setupMockRequest, testItemCollectionMatches, testItemMatches, testStateCaptors, verifyFailure, TestItemExpectation, TestFailureExpectation } from '../helpers';
import { StubTestController } from '../../stubs/stubTestController';

suite('Extension Test for RSpec', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]
  let config: RspecConfig
  let testRunner: RspecTestRunner;
  let testLoader: TestLoader;
  let testSuite: TestSuite;
  let resolveTestsProfile: vscode.TestRunProfile;

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

  before(function() {
    vscode.workspace.getConfiguration('rubyTestExplorer').update('rspecDirectory', 'spec')
    vscode.workspace.getConfiguration('rubyTestExplorer').update('filePattern', ['*_spec.rb'])
    config = new RspecConfig(path.resolve("ruby"), workspaceFolder)
  })

  suite('dry run', function() {
    beforeEach(function () {
      testController = new StubTestController(stdout_logger())
      testSuite = new TestSuite(noop_logger(), testController, config)
      testRunner = new RspecTestRunner(noop_logger(), testController, config, testSuite, workspaceFolder)
      let mockProfile = mock<vscode.TestRunProfile>()
      when(mockProfile.runHandler).thenReturn(testRunner.runHandler)
      when(mockProfile.label).thenReturn('ResolveTests')
      resolveTestsProfile = instance(mockProfile)
      testLoader = new TestLoader(noop_logger(), testController, resolveTestsProfile, config, testSuite);
    })

    test('Load tests on file resolve request', async function () {
      // Populate controller with test files. This would be done by the filesystem globs in the watchers
      let createTest = (id: string, label?: string) =>
      testController.createTestItem(id, label || id, vscode.Uri.file(expectedPath(id)))
      testController.items.add(createTest("abs_spec.rb"))
      let subfolderItem = createTest("square")
      testController.items.add(subfolderItem)
      subfolderItem.children.add(createTest("square/square_spec.rb", "square_spec.rb"))

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
            file: expectedPath("square"),
            id: "square",
            label: "square",
            children: [
              {
                file: expectedPath("square/square_spec.rb"),
                id: "square/square_spec.rb",
                label: "square_spec.rb",
                children: []
              },
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
              abs_positive_expectation,
              abs_zero_expectation,
              abs_negative_expectation
            ]
          },
          {
            file: expectedPath("square"),
            id: "square",
            label: "square",
            children: [
              {
                file: expectedPath("square/square_spec.rb"),
                id: "square/square_spec.rb",
                label: "square_spec.rb",
                children: []
              },
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
              abs_positive_expectation,
              abs_zero_expectation,
              abs_negative_expectation
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
    let cancellationTokenSource = new vscode.CancellationTokenSource();

    before(async function() {
      testController = new StubTestController(stdout_logger())
      testSuite = new TestSuite(stdout_logger(), testController, config)
      testRunner = new RspecTestRunner(stdout_logger("debug"), testController, config, testSuite, workspaceFolder)
      let mockProfile = mock<vscode.TestRunProfile>()
      when(mockProfile.runHandler).thenReturn(testRunner.runHandler)
      when(mockProfile.label).thenReturn('ResolveTests')
      resolveTestsProfile = instance(mockProfile)
      testLoader = new TestLoader(stdout_logger(), testController, resolveTestsProfile, config, testSuite);
      await testLoader.discoverAllFilesInWorkspace()
    })

    suite.only(`running collections emits correct statuses`, async function() {
      let mockTestRun: vscode.TestRun

      test('when running full suite', async function() {
        let mockRequest = setupMockRequest(testSuite)
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)
        mockTestRun = (testController as StubTestController).getMockTestRun(request)!

        verify(mockTestRun.enqueued(anything())).times(0)
        verify(mockTestRun.started(anything())).times(8)
        verify(mockTestRun.passed(anything(), anything())).times(4)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(3)
        verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
        verify(mockTestRun.skipped(anything())).times(2)
      })

      test('when running all top-level items', async function() {
        let mockRequest = setupMockRequest(testSuite, ["abs_spec.rb", "square"])
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)
        mockTestRun = (testController as StubTestController).getMockTestRun(request)!

        verify(mockTestRun.enqueued(anything())).times(0)
        verify(mockTestRun.started(anything())).times(8)
        verify(mockTestRun.passed(anything(), anything())).times(4)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(3)
        verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
        verify(mockTestRun.skipped(anything())).times(2)
      })

      test('when running all files', async function() {
        let mockRequest = setupMockRequest(testSuite, ["abs_spec.rb", "square/square_spec.rb"])
        let request = instance(mockRequest)
        await testRunner.runHandler(request, cancellationTokenSource.token)
        mockTestRun = (testController as StubTestController).getMockTestRun(request)!

        verify(mockTestRun.enqueued(anything())).times(0)
        // One less 'started' than the other tests as it doesn't include the 'square' folder
        verify(mockTestRun.started(anything())).times(7)
        verify(mockTestRun.passed(anything(), anything())).times(4)
        verify(mockTestRun.failed(anything(), anything(), anything())).times(3)
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
            message: "RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n",
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
            message: "RuntimeError:\nAbs for zero is not supported",
            line: 8,
          }
        },
        {
          status: "skipped",
          expectedTest: abs_negative_expectation
        }
      ]
      for(const {status, expectedTest, failureExpectation} of params) {
        let mockTestRun: vscode.TestRun

        beforeEach(async function() {
          let mockRequest = setupMockRequest(testSuite, expectedTest.id)
          let request = instance(mockRequest)
          await testRunner.runHandler(request, cancellationTokenSource.token)
          mockTestRun = (testController as StubTestController).getMockTestRun(request)!
        })

        test(`id: ${expectedTest.id}, status: ${status}`, function() {
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
              verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, expectedTest, {line: failureExpectation!.line})
              verifyFailure(1, testStateCaptors(mockTestRun).failedArgs, expectedTest, failureExpectation!)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(2)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
              verify(mockTestRun.skipped(anything())).times(0)
              break;
            case "errored":
              verifyFailure(0, testStateCaptors(mockTestRun).failedArgs, expectedTest, {line: failureExpectation!.line})
              verifyFailure(0, testStateCaptors(mockTestRun).erroredArgs, expectedTest, failureExpectation!)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(1)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(1)
              verify(mockTestRun.skipped(anything())).times(0)
              break;
            case "skipped":
              testItemMatches(testStateCaptors(mockTestRun).skippedArg(0), expectedTest)
              testItemMatches(testStateCaptors(mockTestRun).skippedArg(1), expectedTest)
              verify(mockTestRun.passed(anything(), anything())).times(0)
              verify(mockTestRun.failed(anything(), anything(), anything())).times(0)
              verify(mockTestRun.errored(anything(), anything(), anything())).times(0)
              verify(mockTestRun.skipped(anything())).times(2)
              break;
          }
          expect(testStateCaptors(mockTestRun).startedArg(0).id).to.eq(expectedTest.id)
          verify(mockTestRun.started(anything())).times(1)

          // Verify that no other status events occurred
          verify(mockTestRun.enqueued(anything())).times(0)
        })
      }
    })
  })
});
