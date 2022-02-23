import { setupMockTestController, stdout_logger, testItemArrayMatches } from "../helpers";
import { instance, mock, spy, when } from 'ts-mockito'
import * as vscode from 'vscode'
import * as path from 'path'
import { expect } from "chai";
import { ParsedTest, TestLoader } from "../../../src/testLoader";
import { RspecTestRunner } from "../../../src/rspec/rspecTestRunner";
import { RspecConfig } from "../../../src/rspec/rspecConfig";

suite('TestLoader', function() {
  let mockTestController = setupMockTestController()
  let mockTestRunner = mock<RspecTestRunner>()
  let loader:TestLoader

  const rspecDir = path.resolve("./test/fixtures/rspec/spec")
  const config = new RspecConfig(path.resolve("./ruby"))
  const configWrapper: RspecConfig = {
    frameworkName: config.frameworkName,
    getTestCommand: config.getTestCommand,
    getDebugCommand: config.getDebugCommand,
    getTestCommandWithFilePattern: config.getTestCommandWithFilePattern,
    getTestDirectory: () => rspecDir,
    getCustomFormatterLocation: config.getCustomFormatterLocation,
    testCommandWithFormatterAndDebugger: config.testCommandWithFormatterAndDebugger,
    getProcessEnv: config.getProcessEnv,
    getFrameworkTestDirectory: config.getFrameworkTestDirectory,
    rubyScriptPath: config.rubyScriptPath,
    getFilePattern: config.getFilePattern
  }

  suite('#getBaseTestSuite()', function() {
    this.beforeEach(function() {
      let spiedWorkspace = spy(vscode.workspace)
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
        .thenReturn({ get: (section: string) => {
          section == "framework" ? "rspec" : undefined
        }} as vscode.WorkspaceConfiguration)


      loader = new TestLoader(stdout_logger(), vscode.workspace.workspaceFolders![0], instance(mockTestController), instance(mockTestRunner), configWrapper)
      let loaderSpy = spy(loader)
      when(loaderSpy["getTestDirectory"]()).thenReturn(rspecDir)
    })

    this.afterEach(function() {
      loader.dispose()
    })

    test('no input, no output, no error', async function() {
      let testItems: vscode.TestItem[]
      expect(testItems = await loader["getBaseTestSuite"]([] as ParsedTest[])).to.not.throw

      expect(testItems).to.not.be.undefined
      expect(testItems).to.have.length(0)
    });

    test('single file with one test case', async function() {
      let tests: ParsedTest[] = [
        {
          id: "abs_spec.rb[1:1]",
          full_description: "Abs finds the absolute value of 1",
          description: "finds the absolute value of 1",
          file_path: "abs_spec.rb",
          line_number: 4,
          location: 11,
        }
      ];
      let testItems: vscode.TestItem[]
      expect(testItems = await loader["getBaseTestSuite"](tests)).to.not.throw

      expect(testItems).to.not.be.undefined
      expect(testItems).to.have.length(1)
      testItemArrayMatches(testItems, [
        {
          id: "abs_spec.rb",
          file: path.join(rspecDir, "abs_spec.rb"),
          label: "abs_spec.rb",
          children: [
            {
              id: "abs_spec.rb[1:1]",
              file: path.join(rspecDir, "abs_spec.rb"),
              label: "finds the absolute value of 1",
              line: 3
            }
          ]
        }
      ])
    })

    test('single file with two test cases', async function() {
      let tests: ParsedTest[] = [
        {
          id: "abs_spec.rb[1:1]",
          full_description: "Abs finds the absolute value of 1",
          description: "finds the absolute value of 1",
          file_path: "abs_spec.rb",
          line_number: 4,
          location: 11,
        },
        {
          id: "abs_spec.rb[1:2]",
          full_description: "Abs finds the absolute value of 0",
          description: "finds the absolute value of 0",
          file_path: "abs_spec.rb",
          line_number: 8,
          location: 12,
        }
      ];
      let testItems: vscode.TestItem[]
      expect(testItems = await loader["getBaseTestSuite"](tests)).to.not.throw

      expect(testItems).to.not.be.undefined
      expect(testItems).to.have.length(1)
      testItemArrayMatches(testItems, [
        {
          id: "abs_spec.rb",
          file: path.join(rspecDir, "abs_spec.rb"),
          label: "abs_spec.rb",
          children: [
            {
              id: "abs_spec.rb[1:1]",
              file: path.join(rspecDir, "abs_spec.rb"),
              label: "finds the absolute value of 1",
              line: 3
            },
            {
              id: "abs_spec.rb[1:2]",
              file: path.join(rspecDir, "abs_spec.rb"),
              label: "finds the absolute value of 0",
              line: 7
            },
          ]
        }
      ])
    })

    test('two files, one with a suite, each with one test case', async function() {
      let tests: ParsedTest[] = [
        {
          id: "abs_spec.rb[1:1]",
          full_description: "Abs finds the absolute value of 1",
          description: "finds the absolute value of 1",
          file_path: "abs_spec.rb",
          line_number: 4,
          location: 11,
        },
        {
          id: "square_spec.rb[1:1:1]",
          full_description: "Square an unnecessary suite finds the square of 2",
          description: "finds the square of 2",
          file_path: "square_spec.rb",
          line_number: 5,
          location: 111,
        }
      ];
      let testItems: vscode.TestItem[]
      expect(testItems = await loader["getBaseTestSuite"](tests)).to.not.throw

      expect(testItems).to.not.be.undefined
      expect(testItems).to.have.length(2)
      testItemArrayMatches(testItems, [
        {
          id: "abs_spec.rb",
          file: path.join(rspecDir, "abs_spec.rb"),
          label: "abs_spec.rb",
          children: [
            {
              id: "abs_spec.rb[1:1]",
              file: path.join(rspecDir, "abs_spec.rb"),
              label: "finds the absolute value of 1",
              line: 3
            }
          ]
        },
        {
          id: "square_spec.rb",
          file: path.join(rspecDir, "square_spec.rb"),
          label: "square_spec.rb",
          children: [
            {
              id: "square_spec.rb[1:1:1]",
              file: path.join(rspecDir, "square_spec.rb"),
              label: "an unnecessary suite finds the square of 2",
              line: 4
            },
          ]
        }
      ])
    })

    test('subfolder containing single file with one test case', async function() {
      let tests: ParsedTest[] = [
        {
          id: "subfolder/foo_spec.rb[1:1]",
          full_description: "Foo wibbles and wobbles",
          description: "wibbles and wobbles",
          file_path: "subfolder/foo_spec.rb",
          line_number: 3,
          location: 11,
        }
      ];
      let testItems: vscode.TestItem[]
      expect(testItems = await loader["getBaseTestSuite"](tests)).to.not.throw

      expect(testItems).to.not.be.undefined
      expect(testItems).to.have.length(1, 'Wrong number of children in controller.items')
      testItemArrayMatches(testItems, [
        {
          id: "subfolder",
          file: path.join(rspecDir, "subfolder"),
          label: "subfolder",
          children: [
            {
              id: "subfolder/foo_spec.rb",
              file: path.join(rspecDir, "subfolder", "foo_spec.rb"),
              label: "foo_spec.rb",
              children: [
                {
                  id: "subfolder/foo_spec.rb[1:1]",
                  file: path.join(rspecDir, "subfolder", "foo_spec.rb"),
                  label: "wibbles and wobbles",
                  line: 2
                }
              ]
            }
          ]
        }
      ])
    })
  })
})