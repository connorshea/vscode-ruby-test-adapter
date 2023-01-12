import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as childProcess from 'child_process';
import * as vscode from 'vscode'
import * as path from 'path'

import { Config } from "../../../src/config";
import { TestSuiteManager } from "../../../src/testSuiteManager";
import { TestRunContext } from '../../../src/testRunContext';
import { FrameworkProcess } from '../../../src/frameworkProcess';

import { testItemCollectionMatches, TestItemExpectation } from "../helpers";
import { logger } from '../../stubs/logger';
import { StubTestController } from '../../stubs/stubTestController';

// JSON Fixtures
import rspecDryRunOutput from '../../fixtures/unitTests/rspec/dryRunOutput.json'
import rspecTestRunOutput from '../../fixtures/unitTests/rspec/testRunOutput.json'
import minitestDryRunOutput from '../../fixtures/unitTests/minitest/dryRunOutput.json'
import minitestTestRunOutput from '../../fixtures/unitTests/minitest/testRunOutput.json'

const log = logger("trace")
const cancellationTokenSoure = new vscode.CancellationTokenSource()

suite('FrameworkProcess', function () {
  let manager: TestSuiteManager
  let testController: vscode.TestController
  let mockContext: TestRunContext
  let frameworkProcess: FrameworkProcess
  let spawnOptions: childProcess.SpawnOptions = {}

  const config = mock<Config>()

  before(function () {
    mockContext = mock<TestRunContext>()
    when(mockContext.cancellationToken).thenReturn(cancellationTokenSoure.token)
  })

  suite('#parseAndHandleTestOutput()', function () {
    suite('RSpec output', function () {
      before(function () {
        let relativeTestPath = "spec"
        when(config.getRelativeTestDirectory()).thenReturn(relativeTestPath)
        when(config.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
      })

      beforeEach(function () {
        testController = new StubTestController(log)
        manager = new TestSuiteManager(log, testController, instance(config))
        frameworkProcess = new FrameworkProcess(log, "testCommand", spawnOptions, instance(mockContext), manager)
      })

      const expectedTests: TestItemExpectation[] = [
        {
          id: "square",
          label: "square",
          file: path.resolve("spec", "square"),
          canResolveChildren: true,
          children: [
            {
              id: "square/square_spec.rb",
              label: "Square",
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
        {
          id: "abs_spec.rb",
          label: "Abs",
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
        }
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
        testController = new StubTestController(log)
        manager = new TestSuiteManager(log, testController, instance(config))
        frameworkProcess = new FrameworkProcess(log, "testCommand", spawnOptions, instance(mockContext), manager)
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
              label: "Square",
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
          label: "Abs",
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
})
