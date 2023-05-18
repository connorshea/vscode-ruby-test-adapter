import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { testExplorerExtensionId, TestHub, TestSuiteInfo } from 'vscode-test-adapter-api';
import { DummyController } from '../../DummyController';

suite('Extension Test for RSpec', () => {
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
        label: 'parallel_rspec RSpec',
        children: [
          {
            file: path.resolve(dirPath, "spec/abs_spec.rb"),
            id: "./spec/abs_spec.rb",
            label: "abs_spec.rb",
            type: "suite",
            children: [
              {
                file: path.resolve(dirPath, "spec/abs_spec.rb"),
                id: "./spec/abs_spec.rb[1:1]",
                label: "finds the absolute value of 1",
                line: 3,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "spec/abs_spec.rb"),
                id: "./spec/abs_spec.rb[1:2]",
                label: "finds the absolute value of 0",
                line: 7,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "spec/abs_spec.rb"),
                id: "./spec/abs_spec.rb[1:3]",
                label: "finds the absolute value of -1",
                line: 11,
                type: "test"
              }
            ]
          },
          {
            file: path.resolve(dirPath, "spec/square_spec.rb"),
            id: "./spec/square_spec.rb",
            label: "square_spec.rb",
            type: "suite",
            children: [
              {
                file: path.resolve(dirPath, "spec/square_spec.rb"),
                id: "./spec/square_spec.rb[1:1]",
                label: "finds the square of 2",
                line: 3,
                type: "test"
              },
              {
                file: path.resolve(dirPath, "spec/square_spec.rb"),
                id: "./spec/square_spec.rb[1:2]",
                label: "finds the square of 3",
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
    await controller.runTest('./spec/square_spec.rb')

    assert.deepStrictEqual(
      controller.testEvents['./spec/square_spec.rb[1:1]'],
      [
        { state: "passed", test: "./spec/square_spec.rb[1:1]", type: "test" },
        { state: "passed", test: "./spec/square_spec.rb[1:1]", type: "test" }
      ]
    )
  })

  test('run test failure', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./spec/square_spec.rb')

    assert.deepStrictEqual(
      controller.testEvents['./spec/square_spec.rb[1:2]'][0],
      { state: "failed", test: "./spec/square_spec.rb[1:2]", type: "test" }
    )

    const lastEvent = controller.testEvents['./spec/square_spec.rb[1:2]'][1]
    assert.strictEqual(lastEvent.state, "failed")
    assert.strictEqual(lastEvent.line, undefined)
    assert.strictEqual(lastEvent.tooltip, undefined)
    assert.strictEqual(lastEvent.description, undefined)
    assert.ok(lastEvent.message?.startsWith("RSpec::Expectations::ExpectationNotMetError:\n expected: 9\n     got: 6\n"))

    assert.strictEqual(lastEvent.decorations!.length, 1)
    const decoration = lastEvent.decorations![0]
    assert.strictEqual(decoration.line, 8)
    assert.strictEqual(decoration.file, undefined)
    assert.strictEqual(decoration.hover, undefined)
    assert.strictEqual(decoration.message, " expected: 9\n     got: 6\n\n(compared using ==)\n")
  })

  test('run test error', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./spec/abs_spec.rb[1:2]')

    assert.deepStrictEqual(
      controller.testEvents['./spec/abs_spec.rb[1:2]'][0],
      { state: "running", test: "./spec/abs_spec.rb[1:2]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./spec/abs_spec.rb[1:2]'][1],
      { state: "failed", test: "./spec/abs_spec.rb[1:2]", type: "test" }
    )

    const lastEvent = controller.testEvents['./spec/abs_spec.rb[1:2]'][2]
    assert.strictEqual(lastEvent.state, "failed")
    assert.strictEqual(lastEvent.line, undefined)
    assert.strictEqual(lastEvent.tooltip, undefined)
    assert.strictEqual(lastEvent.description, undefined)
    assert.ok(lastEvent.message?.startsWith("RuntimeError:\nAbs for zero is not supported"))

    assert.strictEqual(lastEvent.decorations!.length, 1)
    const decoration = lastEvent.decorations![0]
    assert.strictEqual(decoration.line, 8)
    assert.strictEqual(decoration.file, undefined)
    assert.strictEqual(decoration.hover, undefined)
    assert.ok(decoration.message?.startsWith("Abs for zero is not supported"))
  })

  test('run test skip', async () => {
    const controller = new DummyController()

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId)!;
    const testHub = testExplorerExtension.exports;

    testHub.registerTestController(controller);

    await controller.load()
    await controller.runTest('./spec/abs_spec.rb[1:3]')

    assert.deepStrictEqual(
      controller.testEvents['./spec/abs_spec.rb[1:3]'][0],
      { state: "running", test: "./spec/abs_spec.rb[1:3]", type: "test" }
    )

    assert.deepStrictEqual(
      controller.testEvents['./spec/abs_spec.rb[1:3]'][1],
      { state: "skipped", test: "./spec/abs_spec.rb[1:3]", type: "test" }
    )
  })
});
