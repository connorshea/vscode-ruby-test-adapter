import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path'
import { capture, instance } from 'ts-mockito'
import { setupMockRequest, stdout_logger, testItemCollectionMatches, TestItemExpectation, testItemMatches } from '../helpers';
import { RspecTestRunner } from '../../../src/rspec/rspecTestRunner';
import { TestLoader } from '../../../src/testLoader';
import { RspecConfig } from '../../../src/rspec/rspecConfig';
import { StubTestController } from '../../stubs/stubTestController';

suite('Extension Test for RSpec', function() {
  let testController: vscode.TestController
  let workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders![0]

  let testRunner: RspecTestRunner;
  let testLoader: TestLoader;

  const dirPath = vscode.workspace.workspaceFolders![0].uri.path

  this.beforeEach(async function() {
    testController = new StubTestController()
    let config = new RspecConfig(path.resolve("./ruby"))
    testRunner = new RspecTestRunner(stdout_logger(), workspaceFolder, testController, config)
    testLoader = new TestLoader(stdout_logger(), workspaceFolder, testController, testRunner, config);
  })

  test('Load all tests', async function() {
    await testLoader.loadAllTests()

    const testSuite = testController.items
    testItemCollectionMatches(testSuite, [
        {
          file: path.resolve(dirPath, "spec/abs_spec.rb"),
          id: "abs_spec.rb",
          label: "abs_spec.rb",
          children: [
            {
              file: path.resolve(dirPath, "spec/abs_spec.rb"),
              id: "abs_spec.rb[1:1]",
              label: "finds the absolute value of 1",
              line: 3,
            },
            {
              file: path.resolve(dirPath, "spec/abs_spec.rb"),
              id: "abs_spec.rb[1:2]",
              label: "finds the absolute value of 0",
              line: 7,
            },
            {
              file: path.resolve(dirPath, "spec/abs_spec.rb"),
              id: "abs_spec.rb[1:3]",
              label: "finds the absolute value of -1",
              line: 11,
            }
          ]
        },
        {
          file: path.resolve(dirPath, "spec/square_spec.rb"),
          id: "square_spec.rb",
          label: "square_spec.rb",
          children: [
            {
              file: path.resolve(dirPath, "spec/square_spec.rb"),
              id: "square_spec.rb[1:1]",
              label: "finds the square of 2",
              line: 3,
            },
            {
              file: path.resolve(dirPath, "spec/square_spec.rb"),
              id: "square_spec.rb[1:2]",
              label: "finds the square of 3",
              line: 7,
            }
          ]
        }
      ]
    )
  })

  test('run test success', async function() {
    await testLoader.loadAllTests()

    let mockRequest = setupMockRequest(testController, "square_spec.rb")
    let request = instance(mockRequest)
    let cancellationTokenSource = new vscode.CancellationTokenSource()
    await testRunner.runHandler(request, cancellationTokenSource.token)

    let mockTestRun = (testController as StubTestController).getMockTestRun()

    let expectation: TestItemExpectation = {
      id: "square_spec.rb[1:1]",
      file: path.resolve(dirPath, "./spec/square_spec.rb"),
      label: "finds the square of 2",
      line: 3
    }
    testItemMatches(
      capture(mockTestRun.passed).first()[0],
      expectation
    )
  })

  test('run test failure', async function() {
    assert.fail("Not yet fixed for new API")
    // await controller.load()
    // await controller.runTest('./spec/square_spec.rb')

    // assert.deepStrictEqual(
    //   controller.testEvents['./spec/square_spec.rb[1:2]'][0],
    //   { state: "failed", test: "./spec/square_spec.rb[1:2]", type: "test" }
    // )

    // const lastEvent = controller.testEvents['./spec/square_spec.rb[1:2]'][1]
    // assert.strictEqual(lastEvent.state, "failed")
    // assert.strictEqual(lastEvent.line, undefined)
    // assert.strictEqual(lastEvent.tooltip, undefined)
    // assert.strictEqual(lastEvent.description, undefined)
    // assert.ok(lastEvent.message?.startsWith("RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n"))

    // assert.strictEqual(lastEvent.decorations!.length, 1)
    // const decoration = lastEvent.decorations![0]
    // assert.strictEqual(decoration.line, 8)
    // assert.strictEqual(decoration.file, undefined)
    // assert.strictEqual(decoration.hover, undefined)
    // assert.strictEqual(decoration.message, " expected: 9\n     got: 6\n\n(compared using ==)\n")
  })

  test('run test error', async function() {
    assert.fail("Not yet fixed for new API")
    // await controller.load()
    // await controller.runTest('./spec/abs_spec.rb[1:2]')

    // assert.deepStrictEqual(
    //   controller.testEvents['./spec/abs_spec.rb[1:2]'][0],
    //   { state: "running", test: "./spec/abs_spec.rb[1:2]", type: "test" }
    // )

    // assert.deepStrictEqual(
    //   controller.testEvents['./spec/abs_spec.rb[1:2]'][1],
    //   { state: "failed", test: "./spec/abs_spec.rb[1:2]", type: "test" }
    // )

    // const lastEvent = controller.testEvents['./spec/abs_spec.rb[1:2]'][2]
    // assert.strictEqual(lastEvent.state, "failed")
    // assert.strictEqual(lastEvent.line, undefined)
    // assert.strictEqual(lastEvent.tooltip, undefined)
    // assert.strictEqual(lastEvent.description, undefined)
    // assert.ok(lastEvent.message?.startsWith("RuntimeError:\nAbs for zero is not supported"))

    // assert.strictEqual(lastEvent.decorations!.length, 1)
    // const decoration = lastEvent.decorations![0]
    // assert.strictEqual(decoration.line, 8)
    // assert.strictEqual(decoration.file, undefined)
    // assert.strictEqual(decoration.hover, undefined)
    // assert.ok(decoration.message?.startsWith("Abs for zero is not supported"))
  })

  test('run test skip', async function() {
    assert.fail("Not yet fixed for new API")
    // await controller.load()
    // await controller.runTest('./spec/abs_spec.rb[1:3]')

    // assert.deepStrictEqual(
    //   controller.testEvents['./spec/abs_spec.rb[1:3]'][0],
    //   { state: "running", test: "./spec/abs_spec.rb[1:3]", type: "test" }
    // )

    // assert.deepStrictEqual(
    //   controller.testEvents['./spec/abs_spec.rb[1:3]'][1],
    //   { state: "skipped", test: "./spec/abs_spec.rb[1:3]", type: "test" }
    // )
  })
});
