//import { expect } from "chai";
import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'
import * as path from 'path'

import { Config } from "../../../src/config";
import { TestSuite } from "../../../src/testSuite";
import { TestRunner } from "../../../src/testRunner";
import { RspecTestRunner } from "../../../src/rspec/rspecTestRunner";
import { MinitestTestRunner } from '../../../src/minitest/minitestTestRunner';
import { testItemCollectionMatches, TestItemExpectation } from "../helpers";
import { logger } from '../../stubs/logger';
import { StubTestController } from '../../stubs/stubTestController';

const log = logger("off")

suite('TestRunner', function () {
  let testSuite: TestSuite
  let testController: vscode.TestController
  let testRunner: TestRunner

  const config = mock<Config>()

  suite('#parseAndHandleTestOutput()', function () {
    suite('RSpec output', function () {
      before(function () {
        let relativeTestPath = "spec"
        when(config.getRelativeTestDirectory()).thenReturn(relativeTestPath)
        when(config.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
      })

      beforeEach(function () {
        testController = new StubTestController(log)
        testSuite = new TestSuite(log, testController, instance(config))
        testRunner = new RspecTestRunner(log, testSuite)
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
        {
          id: "abs_spec.rb",
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
        }
      ]
      const outputJson = {
        "version":"3.10.1",
        "examples":[
          {"id":"./spec/square/square_spec.rb[1:1]","description":"finds the square of 2","full_description":"Square finds the square of 2","status":"passed","file_path":"./spec/square/square_spec.rb","line_number":4,"type":null,"pending_message":null},
          {"id":"./spec/square/square_spec.rb[1:2]","description":"finds the square of 3","full_description":"Square finds the square of 3","status":"passed","file_path":"./spec/square/square_spec.rb","line_number":8,"type":null,"pending_message":null},
          {"id":"./spec/abs_spec.rb[1:1]","description":"finds the absolute value of 1","full_description":"Abs finds the absolute value of 1","status":"passed","file_path":"./spec/abs_spec.rb","line_number":4,"type":null,"pending_message":null},
          {"id":"./spec/abs_spec.rb[1:2]","description":"finds the absolute value of 0","full_description":"Abs finds the absolute value of 0","status":"passed","file_path":"./spec/abs_spec.rb","line_number":8,"type":null,"pending_message":null},
          {"id":"./spec/abs_spec.rb[1:3]","description":"finds the absolute value of -1","full_description":"Abs finds the absolute value of -1","status":"passed","file_path":"./spec/abs_spec.rb","line_number":12,"type":null,"pending_message":null}
        ],
        "summary":{"duration":0.006038228,"example_count":6,"failure_count":0,"pending_count":0,"errors_outside_of_examples_count":0},
        "summary_line":"6 examples, 0 failures"
      }
      const output = `START_OF_TEST_JSON${JSON.stringify(outputJson)}END_OF_TEST_JSON`

      test('parses specs correctly', function () {
        testRunner.parseAndHandleTestOutput(output)
        testItemCollectionMatches(testController.items, expectedTests)
      })
    })

    suite('Minitest output', function () {
      before(function () {
        let relativeTestPath = "test"
        when(config.getRelativeTestDirectory()).thenReturn(relativeTestPath)
        when(config.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
      })

      beforeEach(function () {
        testController = new StubTestController(log)
        testSuite = new TestSuite(log, testController, instance(config))
        testRunner = new MinitestTestRunner(log, testSuite)
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
      const outputJson = {
        "version":"5.14.4",
        "examples":[
          {"description":"abs positive","full_description":"abs positive","file_path":"./test/abs_test.rb","full_path":"/home/tabby/git/vscode-ruby-test-adapter/test/fixtures/minitest/test/abs_test.rb","line_number":4,"klass":"AbsTest","method":"test_abs_positive","runnable":"AbsTest","id":"./test/abs_test.rb[4]"},
          {"description":"abs 0","full_description":"abs 0","file_path":"./test/abs_test.rb","full_path":"/home/tabby/git/vscode-ruby-test-adapter/test/fixtures/minitest/test/abs_test.rb","line_number":8,"klass":"AbsTest","method":"test_abs_0","runnable":"AbsTest","id":"./test/abs_test.rb[8]"},
          {"description":"abs negative","full_description":"abs negative","file_path":"./test/abs_test.rb","full_path":"/home/tabby/git/vscode-ruby-test-adapter/test/fixtures/minitest/test/abs_test.rb","line_number":12,"klass":"AbsTest","method":"test_abs_negative","runnable":"AbsTest","id":"./test/abs_test.rb[12]"},
          {"description":"square 2","full_description":"square 2","file_path":"./test/square/square_test.rb","full_path":"/home/tabby/git/vscode-ruby-test-adapter/test/fixtures/minitest/test/square/square_test.rb","line_number":4,"klass":"SquareTest","method":"test_square_2","runnable":"SquareTest","id":"./test/square/square_test.rb[4]"},
          {"description":"square 3","full_description":"square 3","file_path":"./test/square/square_test.rb","full_path":"/home/tabby/git/vscode-ruby-test-adapter/test/fixtures/minitest/test/square/square_test.rb","line_number":8,"klass":"SquareTest","method":"test_square_3","runnable":"SquareTest","id":"./test/square/square_test.rb[8]"}
        ]
      }
      const output = `START_OF_TEST_JSON${JSON.stringify(outputJson)}END_OF_TEST_JSON`

      test('parses specs correctly', function () {
        testRunner.parseAndHandleTestOutput(output)
        testItemCollectionMatches(testController.items, expectedTests)
      })
    })
  })

  // suite('getTestSuiteForFile', function() {
  //   let mockTestRunner: RspecTestRunner
  //   let testRunner: RspecTestRunner
  //   let testLoader: TestLoader
  //   let parsedTests = [{"id":"abs_spec.rb[1:1]","description":"finds the absolute value of 1","full_description":"Abs finds the absolute value of 1","status":"passed","file_path":"abs_spec.rb","line_number":4,"type":null,"pending_message":null,"location":11}]
  //   let expectedPath = path.resolve('test', 'fixtures', 'rspec', 'spec')
  //   let id = "abs_spec.rb"
  //   let abs_spec_item: vscode.TestItem
  //   let createTestItem = (id: string): vscode.TestItem => {
  //     return testController.createTestItem(id, id, vscode.Uri.file(path.resolve(expectedPath, id)))
  //   }

  //   this.beforeAll(function () {
  //     when(config.getRelativeTestDirectory()).thenReturn('spec')
  //     when(config.getAbsoluteTestDirectory()).thenReturn(expectedPath)
  //   })

  //   this.beforeEach(function () {
  //     mockTestRunner = mock(RspecTestRunner)
  //     testRunner = instance(mockTestRunner)
  //     testController = new StubTestController()
  //     testSuite = new TestSuite(noop_logger(), testController, instance(config))
  //     testLoader = new TestLoader(noop_logger(), testController, testRunner, config, testSuite)
  //     abs_spec_item = createTestItem(id)
  //     testController.items.add(abs_spec_item)
  //   })

  //   test('creates test items from output', function () {
  //     expect(abs_spec_item.children.size).to.eq(0)

  //     testLoader.getTestSuiteForFile(parsedTests, abs_spec_item)

  //     expect(abs_spec_item.children.size).to.eq(1)
  //   })

  //   test('removes test items not in output', function () {
  //     let missing_id = "abs_spec.rb[3:1]"
  //     let missing_child_item = createTestItem(missing_id)
  //     abs_spec_item.children.add(missing_child_item)
  //     expect(abs_spec_item.children.size).to.eq(1)

  //     testLoader.getTestSuiteForFile(parsedTests, abs_spec_item)

  //     expect(abs_spec_item.children.size).to.eq(1)
  //     expect(abs_spec_item.children.get(missing_id)).to.be.undefined
  //     expect(abs_spec_item.children.get("abs_spec.rb[1:1]")).to.not.be.undefined
  //   })
  // })
})
