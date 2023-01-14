import { before, beforeEach, afterEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as childProcess from 'child_process';
import * as vscode from 'vscode'
import * as path from 'path'

import { Config } from "../../../src/config";
import { TestSuiteManager } from "../../../src/testSuiteManager";
import { FrameworkProcess } from '../../../src/frameworkProcess';

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
        testController = vscode.tests.createTestController('ruby-test-explorer', 'Ruby Test Explorer');
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
        testController = vscode.tests.createTestController('ruby-test-explorer', 'Ruby Test Explorer');
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
})
