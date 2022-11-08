import * as vscode from 'vscode';
import * as path from 'path'
import { anything, instance, verify } from 'ts-mockito'
import { setupMockRequest, stdout_logger, testItemCollectionMatches, testItemMatches, testStateCaptors } from '../helpers';
import { RspecTestRunner } from '../../../src/rspec/rspecTestRunner';
import { TestLoader } from '../../../src/testLoader';
import { RspecConfig } from '../../../src/rspec/rspecConfig';
import { StubTestController } from '../../stubs/stubTestController';
import { expect } from 'chai';
import { TestSuite } from '../../../src/testSuite';

suite('Extension Test for RSpec', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]
  let config: RspecConfig
  let testRunner: RspecTestRunner;
  let testLoader: TestLoader;

  const dirPath = path.resolve("ruby")
  let expectedPath = (file: string): string => {
    return path.resolve(
      dirPath,
      '..',
      'test',
      'fixtures',
      'rspec',
      'spec',
      file)
  }

  this.beforeEach(async function() {
    testController = new StubTestController()

    // Populate controller with test files. This would be done by the filesystem globs in the watchers
    let createTest = (id: string) => testController.createTestItem(id, id, vscode.Uri.file(expectedPath(id)))
    testController.items.add(createTest("abs_spec.rb"))
    testController.items.add(createTest("square_spec.rb"))
    let subfolderItem = createTest("subfolder")
    testController.items.add(subfolderItem)
    subfolderItem.children.add(createTest("subfolder/foo_spec.rb"))

    config = new RspecConfig(dirPath)
    let testSuite = new TestSuite(stdout_logger(), testController, config)
    testRunner = new RspecTestRunner(stdout_logger(), workspaceFolder, testController, config, testSuite)
    testLoader = new TestLoader(stdout_logger(), workspaceFolder, testController, testRunner, config, testSuite);
  })

  test('Load tests on file resolve request', async function () {
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

  test('Load all tests', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_spec.rb")))
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("square_spec.rb")))
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("subfolder/foo_spec.rb")))

    const testSuite = testController.items

    console.log(`testSuite: ${JSON.stringify(testSuite)}`)

    testItemCollectionMatches(testSuite,
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
          children: [
            {
              file: expectedPath(path.join("subfolder", "foo_spec.rb")),
              id: "subfolder/foo_spec.rb",
              label: "foo_spec.rb",
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

  test('run test success', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("square_spec.rb")))

    let mockRequest = setupMockRequest(testController, "square_spec.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun)
    let expectation = {
      id: "square_spec.rb[1:1]",
      file: expectedPath("square_spec.rb"),
      label: "finds the square of 2",
      line: 3
    }
    testItemMatches(args.passedArg(0)["testItem"], expectation)
    testItemMatches(args.passedArg(1)["testItem"], expectation)
    testItemMatches(args.passedArg(2)["testItem"], expectation)
    testItemMatches(args.passedArg(3)["testItem"], expectation)
    verify(mockTestRun.passed(anything(), undefined)).times(4)
  })

  test('run test failure', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("square_spec.rb")))

    let mockRequest = setupMockRequest(testController, "square_spec.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun)

    // Initial failure event with no details
    let firstCallArgs = args.failedArg(0)
    expect(firstCallArgs.testItem).to.have.property("id", "square_spec.rb[1:2]")
    expect(firstCallArgs.testItem).to.have.property("label", "finds the square of 3")
    expect(firstCallArgs.message.location?.uri.fsPath).to.eq(expectedPath("square_spec.rb"))

    // Actual failure report
    let expectation = {
      id: "square_spec.rb[1:2]",
      file: expectedPath("square_spec.rb"),
      label: "finds the square of 3",
      line: 7
    }
    let failedArg = args.failedArg(1)
    testItemMatches(failedArg["testItem"], expectation)

    expect(failedArg["message"].message).to.contain("RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n")
    expect(failedArg["message"].actualOutput).to.be.undefined
    expect(failedArg["message"].expectedOutput).to.be.undefined
    expect(failedArg["message"].location?.range.start.line).to.eq(8)
    expect(failedArg["message"].location?.uri.fsPath).to.eq(expectation.file)

    verify(mockTestRun.started(anything())).times(3)
    verify(mockTestRun.failed(anything(), anything(), undefined)).times(4)
  })

  test('run test error', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_spec.rb")))

    let mockRequest = setupMockRequest(testController, "abs_spec.rb[1:2]")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let args = testStateCaptors(mockTestRun)

    // Initial failure event with no details
    let firstCallArgs = args.failedArg(0)
    expect(firstCallArgs.testItem).to.have.property("id", "abs_spec.rb[1:2]")
    expect(firstCallArgs.testItem).to.have.property("label", "finds the absolute value of 0")
    expect(firstCallArgs.message.location?.uri.fsPath).to.eq(expectedPath("abs_spec.rb"))

    // Actual failure report
    let expectation = {
      id: "abs_spec.rb[1:2]",
      file: expectedPath("abs_spec.rb"),
      label: "finds the absolute value of 0",
      line: 7,
    }
    let failedArg = args.failedArg(1)
    testItemMatches(failedArg["testItem"], expectation)

    expect(failedArg["message"].message).to.match(/RuntimeError:\nAbs for zero is not supported/)
    expect(failedArg["message"].actualOutput).to.be.undefined
    expect(failedArg["message"].expectedOutput).to.be.undefined
    expect(failedArg["message"].location?.range.start.line).to.eq(8)
    expect(failedArg["message"].location?.uri.fsPath).to.eq(expectation.file)
    verify(mockTestRun.started(anything())).times(1)
    verify(mockTestRun.failed(anything(), anything(), undefined)).times(2)
  })

  test('run test skip', async function() {
    await testLoader.parseTestsInFile(vscode.Uri.file(expectedPath("abs_spec.rb")))

    let mockRequest = setupMockRequest(testController, "abs_spec.rb[1:3]")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

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
    verify(mockTestRun.started(anything())).times(1)
    verify(mockTestRun.skipped(anything())).times(1)
  })
});
