import * as vscode from 'vscode';
import * as path from 'path'
import { anything, instance, verify } from 'ts-mockito'
import { expect } from 'chai';

import { TestLoader } from '../../../src/testLoader';
import { TestSuite } from '../../../src/testSuite';
import { MinitestTestRunner } from '../../../src/minitest/minitestTestRunner';
import { MinitestConfig } from '../../../src/minitest/minitestConfig';

import { noop_logger, setupMockRequest, testItemCollectionMatches, testItemMatches, testStateCaptors } from '../helpers';
import { StubTestController } from '../../stubs/stubTestController';

suite('Extension Test for Minitest', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]
  let config: MinitestConfig
  let testRunner: MinitestTestRunner;
  let testLoader: TestLoader;
  let testSuite: TestSuite;

  let expectedPath = (file: string): string => {
    return path.resolve(
      'test',
      'fixtures',
      'minitest',
      'test',
      file)
  }

  let abs_positive_expectation = {
    file: expectedPath("abs_test.rb"),
    id: "abs_test.rb[4]",
    label: "abs positive",
    line: 3,
  }
  let abs_zero_expectation = {
    file: expectedPath("abs_test.rb"),
    id: "abs_test.rb[8]",
    label: "abs 0",
    line: 7,
  }
  let abs_negative_expectation = {
    file: expectedPath("abs_test.rb"),
    id: "abs_test.rb[12]",
    label: "abs negative",
    line: 11,
  }
  let square_2_expectation = {
    id: "square/square_test.rb[4]",
    file: expectedPath("square/square_test.rb"),
    label: "square 2",
    line: 3
  }
  let square_3_expectation = {
    id: "square/square_test.rb[8]",
    file: expectedPath("square/square_test.rb"),
    label: "square 3",
    line: 7
  }

  this.beforeEach(async function () {
    vscode.workspace.getConfiguration('rubyTestExplorer').update('minitestDirectory', 'test')
    vscode.workspace.getConfiguration('rubyTestExplorer').update('filePattern', ['*_test.rb'])
    testController = new StubTestController()

    // Populate controller with test files. This would be done by the filesystem globs in the watchers
    let createTest = (id: string, label?: string) =>
      testController.createTestItem(id, label || id, vscode.Uri.file(expectedPath(id)))
    testController.items.add(createTest("abs_test.rb"))
    let squareFolder = createTest("square")
    testController.items.add(squareFolder)
    squareFolder.children.add(createTest("square/square_test.rb", "square_test.rb"))

    config = new MinitestConfig(path.resolve("ruby"), workspaceFolder)

    testSuite = new TestSuite(noop_logger(), testController, config)
    testRunner = new MinitestTestRunner(noop_logger(), workspaceFolder, testController, config, testSuite)
    testLoader = new TestLoader(noop_logger(), testController, testRunner, config, testSuite);
  })

  test('Load tests on file resolve request', async function () {
    // No tests in suite initially, only test files and folders
    testItemCollectionMatches(testController.items,
      [
        {
          file: expectedPath("abs_test.rb"),
          id: "abs_test.rb",
          label: "abs_test.rb",
          children: []
        },
        {
          file: expectedPath("square"),
          id: "square",
          label: "square",
          children: [
            {
              file: expectedPath("square/square_test.rb"),
              id: "square/square_test.rb",
              label: "square_test.rb",
              children: []
            },
          ]
        },
      ]
    )

    // Resolve a file (e.g. by clicking on it in the test explorer)
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_test.rb")))

    // Tests in that file have now been added to suite
    testItemCollectionMatches(testController.items,
      [
        {
          file: expectedPath("abs_test.rb"),
          id: "abs_test.rb",
          label: "abs_test.rb",
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
              file: expectedPath("square/square_test.rb"),
              id: "square/square_test.rb",
              label: "square_test.rb",
              children: []
            },
          ],
        },
      ]
    )
  })

  test('Load all tests', async () => {
    await testLoader.discoverAllFilesInWorkspace()

    const testSuite = testController.items

    testItemCollectionMatches(testSuite,
      [
        {
          file: expectedPath("abs_test.rb"),
          id: "abs_test.rb",
          label: "abs_test.rb",
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
              file: expectedPath("square/square_test.rb"),
              id: "square/square_test.rb",
              label: "square_test.rb",
              children: [
                square_2_expectation,
                square_3_expectation
              ]
            },
          ],
        },
      ]
    )
  })

  test('run test success', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("square/square_test.rb")))

    let mockRequest = setupMockRequest(testSuite, "square/square_test.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun)

    // Passed called twice per test in file during dry run
    testItemMatches(args.passedArg(0)["testItem"], square_2_expectation)
    testItemMatches(args.passedArg(1)["testItem"], square_2_expectation)
    testItemMatches(args.passedArg(2)["testItem"], square_3_expectation)
    testItemMatches(args.passedArg(3)["testItem"], square_3_expectation)

    // Passed called again for passing test but not for failing test
    testItemMatches(args.passedArg(4)["testItem"], square_2_expectation)
    verify(mockTestRun.passed(anything(), undefined)).times(5)
  })

  test('run test failure', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("square/square_test.rb")))

    let mockRequest = setupMockRequest(testSuite, "square/square_test.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun).failedArg(0)

    testItemMatches(args.testItem, square_3_expectation)

    expect(args.message.message).to.contain("Expected: 9\n  Actual: 6\n")
    expect(args.message.actualOutput).to.be.undefined
    expect(args.message.expectedOutput).to.be.undefined
    expect(args.message.location?.range.start.line).to.eq(8)
    expect(args.message.location?.uri.fsPath).to.eq(square_3_expectation.file)
    expect(args.message.location?.uri.fsPath).to.eq(expectedPath("square/square_test.rb"))

    verify(mockTestRun.started(anything())).times(1)
    verify(mockTestRun.failed(anything(), anything(), undefined)).times(1)
  })

  test('run test error', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_test.rb")))

    let mockRequest = setupMockRequest(testSuite, "abs_test.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun).erroredArg(0)

    testItemMatches(args.testItem, abs_zero_expectation)

    expect(args.message.message).to.match(/RuntimeError: Abs for zero is not supported/)
    expect(args.message.actualOutput).to.be.undefined
    expect(args.message.expectedOutput).to.be.undefined
    expect(args.message.location?.range.start.line).to.eq(8)
    expect(args.message.location?.uri.fsPath).to.eq(abs_zero_expectation.file)
    expect(args.message.location?.uri.fsPath).to.eq(expectedPath("abs_test.rb"))
    verify(mockTestRun.started(anything())).times(1)
    verify(mockTestRun.failed(anything(), anything(), undefined)).times(0)
    verify(mockTestRun.errored(anything(), anything(), undefined)).times(1)
  })

  test('run test skip', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_test.rb")))

    let mockRequest = setupMockRequest(testSuite, "abs_test.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun)
    testItemMatches(args.startedArg(0), {
      file: expectedPath("abs_test.rb"),
      id: "abs_test.rb",
      label: "abs_test.rb",
      children: [
        abs_positive_expectation,
        abs_zero_expectation,
        abs_negative_expectation
      ]
    })
    testItemMatches(args.skippedArg(0), abs_negative_expectation)
    verify(mockTestRun.started(anything())).times(1)
    verify(mockTestRun.skipped(anything())).times(1)
  })
});
