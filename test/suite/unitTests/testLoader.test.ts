import { expect } from "chai";
import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'

import { Config } from "../../../src/config";
import { ParsedTest, TestLoader } from "../../../src/testLoader";
import { TestSuite } from "../../../src/testSuite";
import { noop_logger } from "../helpers";
import { StubTestController } from '../../stubs/stubTestController';

suite('TestLoader', function () {
  let testSuite: TestSuite
  let testController: vscode.TestController

  const config = mock<Config>()

  suite('#parseDryRunOutput()', function () {
    suite('RSpec output', function () {
      before(function () {
        when(config.getRelativeTestDirectory()).thenReturn('spec')
      })

      beforeEach(function () {
        testController = new StubTestController()
        testSuite = new TestSuite(noop_logger(), testController, instance(config))
      })

      const examples: ParsedTest[] = [
        {
          "id": "./spec/abs_spec.rb[1:1]",
          "description": "finds the absolute value of 1",
          "full_description": "Abs finds the absolute value of 1",
          "status": "passed",
          "file_path": "./spec/abs_spec.rb",
          "line_number": 4,
          "type": null,
          "pending_message": null
        },
        {
          "id": "./spec/abs_spec.rb[1:2]",
          "description": "finds the absolute value of 0",
          "full_description": "Abs finds the absolute value of 0",
          "status": "passed",
          "file_path": "./spec/abs_spec.rb",
          "line_number": 8,
          "type": null,
          "pending_message": null
        },
        {
          "id": "./spec/abs_spec.rb[1:3]",
          "description": "finds the absolute value of -1",
          "full_description": "Abs finds the absolute value of -1",
          "status": "passed",
          "file_path": "./spec/abs_spec.rb",
          "line_number": 12,
          "type": null,
          "pending_message": null
        }
      ]
      const parameters = examples.map(
        (spec: ParsedTest, i: number, examples: ParsedTest[]) => {
          return {
            index: i,
            spec: spec,
            expected_location: i + 11,
            expected_id: `abs_spec.rb[1:${i + 1}]`,
            expected_file_path: 'abs_spec.rb'
          }
        }
      )

      parameters.forEach(({
        index,
        spec,
        expected_location,
        expected_id,
        expected_file_path
      }) => {
        test(`parses specs correctly - ${spec["id"]}`, function () {
          let parsedSpec = TestLoader.parseDryRunOutput(
            noop_logger(),
            testSuite,
            [spec]
          )[0]
          expect(parsedSpec['location']).to.eq(expected_location, 'location incorrect')
          expect(parsedSpec['id']).to.eq(expected_id, 'id incorrect')
          expect(parsedSpec['file_path']).to.eq(expected_file_path, 'file path incorrect')
        })
      })
    })

    suite('Minitest output', function () {
      before(function () {
        when(config.getRelativeTestDirectory()).thenReturn('test')
      })

      beforeEach(function () {
        testController = new StubTestController()
        testSuite = new TestSuite(noop_logger(), testController, instance(config))
      })

      const examples: ParsedTest[] = [
        {
          "description": "abs positive",
          "full_description": "abs positive",
          "file_path": "./test/abs_test.rb",
          "full_path": "home/foo/test/fixtures/minitest/test/abs_test.rb",
          "line_number": 4,
          "klass": "AbsTest",
          "method": "test_abs_positive",
          "runnable": "AbsTest",
          "id": "./test/abs_test.rb[4]"
        },
        {
          "description": "abs 0",
          "full_description": "abs 0",
          "file_path": "./test/abs_test.rb",
          "full_path": "/home/foo/test/fixtures/minitest/test/abs_test.rb",
          "line_number": 8,
          "klass": "AbsTest",
          "method": "test_abs_0",
          "runnable": "AbsTest",
          "id": "./test/abs_test.rb[8]"
        },
        {
          "description": "abs negative",
          "full_description": "abs negative",
          "file_path": "./test/abs_test.rb",
          "full_path": "/home/foo/test/fixtures/minitest/test/abs_test.rb",
          "line_number": 12,
          "klass": "AbsTest",
          "method": "test_abs_negative",
          "runnable": "AbsTest",
          "id": "./test/abs_test.rb[12]"
        },
        {
          "description": "square 2",
          "full_description": "square 2",
          "file_path": "./test/square_test.rb",
          "full_path": "/home/foo/test/fixtures/minitest/test/square_test.rb",
          "line_number": 4,
          "klass": "SquareTest",
          "method": "test_square_2",
          "runnable": "SquareTest",
          "id": "./test/square_test.rb[4]"
        },
        {
          "description": "square 3",
          "full_description": "square 3",
          "file_path": "./test/square_test.rb",
          "full_path": "/home/foo/test/fixtures/minitest/test/square_test.rb",
          "line_number": 8,
          "klass": "SquareTest",
          "method": "test_square_3",
          "runnable": "SquareTest",
          "id": "./test/square_test.rb[8]"
        }
      ]
      const parameters = examples.map(
        (spec: ParsedTest, i: number, examples: ParsedTest[]) => {
          return {
            index: i,
            spec: spec,
            expected_location: examples[i]["line_number"],
            expected_id: `${examples[i]["file_path"].replace('./test/', '')}[${examples[i]["line_number"]}]`,
            expected_file_path: `${examples[i]["file_path"].replace('./test/', '')}`
          }
        }
      )

      parameters.forEach(({
        index,
        spec,
        expected_location,
        expected_id,
        expected_file_path
      }) => {
        test(`parses specs correctly - ${spec["id"]}`, function () {
          let parsedSpec = TestLoader.parseDryRunOutput(
            noop_logger(),
            testSuite,
            [spec]
          )[0]
          expect(parsedSpec['location']).to.eq(expected_location, 'location incorrect')
          expect(parsedSpec['id']).to.eq(expected_id, 'id incorrect')
          expect(parsedSpec['file_path']).to.eq(expected_file_path, 'file path incorrect')
        })
      })
    })
  })
})
