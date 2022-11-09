import { expect } from "chai";
import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'

import { Config } from "../../../src/config";
import { ParsedTest, TestLoader } from "../../../src/testLoader";
import { TestSuite } from "../../../src/testSuite";
import { noop_logger, stdout_logger } from "../helpers";
import { StubTestController } from '../../stubs/stubTestController';

suite('TestLoader', function () {
  let testSuite: TestSuite
  let testController: vscode.TestController

  const config = mock<Config>()

  before(function () {
    console.log('before')
    when(config.getTestDirectory()).thenReturn('spec')
  })

  beforeEach(function () {
    testController = new StubTestController()
    testSuite = new TestSuite(stdout_logger(), testController, instance(config))
  })

  suite('#parseDryRunOutput()', function () {
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
})
