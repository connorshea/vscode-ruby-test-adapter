import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { testExplorerExtensionId, TestHub, TestSuiteInfo } from 'vscode-test-adapter-api';
import { DummyController } from '../DummyController';

suite('Extension Test for Minitest', () => {
  test('Load all tests', async () => {
    const controller = new DummyController()
    const dirPath = vscode.workspace.workspaceFolders![0].uri.path

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()

    assert.deepStrictEqual(
      controller.suite,
      {
        type: 'suite',
        id: 'root',
        label: 'minitest Minitest',
        children: [
          {
            file: path.resolve(dirPath, "test/abs_test.rb"),
            id: "./test/abs_test.rb",
            label: "abs_test.rb",
            type: "suite",
            children: [
              {
                file: path.resolve(dirPath, "test/abs_test.rb"),
                id: "./test/abs_test.rb[4]",
                label: "abs positive",
                line: 3,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "test/abs_test.rb"),
                id: "./test/abs_test.rb[8]",
                label: "abs 0",
                line: 7,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "test/abs_test.rb"),
                id: "./test/abs_test.rb[12]",
                label: "abs negative",
                line: 11,
                type: "test"
              }
            ]
          },
          {
            file: path.resolve(dirPath, "test/square_test.rb"),
            id: "./test/square_test.rb",
            label: "square_test.rb",
            type: "suite",
            children: [
              {
                file: path.resolve(dirPath, "test/square_test.rb"),
                id: "./test/square_test.rb[4]",
                label: "square 2",
                line: 3,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "test/square_test.rb"),
                id: "./test/square_test.rb[8]",
                label: "square 3",
                line: 7,
                type: "test"
              }
            ]
          }
        ]
      } as TestSuiteInfo
    )
  })

  test('run test success', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./test/square_test.rb[4]')

    assert.deepStrictEqual(
      controller.testEvents['./test/square_test.rb[4]'],
      [
        { state: "running", test: "./test/square_test.rb[4]", type: "test" },
        { state: "running", test: "./test/square_test.rb[4]", type: "test" },
        { state: "passed", test: "./test/square_test.rb[4]", type: "test" },
        { state: "passed", test: "./test/square_test.rb[4]", type: "test" }
      ]
    )
  })

  test('run test failure', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./test/square_test.rb[8]')

    assert.deepStrictEqual(
      controller.testEvents['./test/square_test.rb[8]'][0],
      { state: "running", test: "./test/square_test.rb[8]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/square_test.rb[8]'][1],
      { state: "running", test: "./test/square_test.rb[8]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/square_test.rb[8]'][2],
      { state: "failed", test: "./test/square_test.rb[8]", type: "test" }
    )

    const lastEvent = controller.testEvents['./test/square_test.rb[8]'][3]
    assert.strictEqual(lastEvent.state, "failed")
    assert.strictEqual(lastEvent.line, undefined)
    assert.strictEqual(lastEvent.tooltip, undefined)
    assert.strictEqual(lastEvent.description, undefined)
    assert.ok(lastEvent.message?.startsWith("Expected: 9\n  Actual: 6\n"))

    assert.strictEqual(lastEvent.decorations!.length, 1)
    const decoration = lastEvent.decorations![0]
    assert.strictEqual(decoration.line, 8)
    assert.strictEqual(decoration.file, undefined)
    assert.strictEqual(decoration.hover, undefined)
    assert.strictEqual(decoration.message, "Expected: 9\n  Actual: 6")
  })

  test('run test error', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./test/abs_test.rb[8]')

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[8]'][0],
      { state: "running", test: "./test/abs_test.rb[8]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[8]'][1],
      { state: "running", test: "./test/abs_test.rb[8]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[8]'][2],
      { state: "failed", test: "./test/abs_test.rb[8]", type: "test" }
    )

    const lastEvent = controller.testEvents['./test/abs_test.rb[8]'][3]
    assert.strictEqual(lastEvent.state, "failed")
    assert.strictEqual(lastEvent.line, undefined)
    assert.strictEqual(lastEvent.tooltip, undefined)
    assert.strictEqual(lastEvent.description, undefined)
    assert.ok(lastEvent.message?.startsWith("RuntimeError: Abs for zero is not supported\n"))

    assert.strictEqual(lastEvent.decorations!.length, 1)
    const decoration = lastEvent.decorations![0]
    assert.strictEqual(decoration.line, 8)
    assert.strictEqual(decoration.file, undefined)
    assert.strictEqual(decoration.hover, undefined)
    assert.ok(decoration.message?.startsWith("RuntimeError: Abs for zero is not supported\n"))
  })

  test('run test skip', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./test/abs_test.rb[12]')

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[12]'][0],
      { state: "running", test: "./test/abs_test.rb[12]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[12]'][1],
      { state: "running", test: "./test/abs_test.rb[12]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./test/abs_test.rb[12]'][2],
      { state: "skipped", test: "./test/abs_test.rb[12]", type: "test" }
    )

    const lastEvent = controller.testEvents['./test/abs_test.rb[12]'][3]
    assert.strictEqual(lastEvent.state, "skipped")
    assert.strictEqual(lastEvent.line, undefined)
    assert.strictEqual(lastEvent.tooltip, undefined)
    assert.strictEqual(lastEvent.description, undefined)
    assert.strictEqual(lastEvent.message, "Not implemented yet")

    assert.strictEqual(lastEvent.decorations, undefined)
  })
});
