import { expect } from "chai";
import { spy, when } from '@typestrong/ts-mockito'
import * as vscode from 'vscode'
import * as path from 'path'

import { Config } from "../../../src/config";
import { RspecConfig } from "../../../src/rspec/rspecConfig";
import { logger } from "../helpers";

const log = logger("off")

suite('Config', function() {
  let setConfig = (testFramework: string) => {
    let spiedWorkspace = spy(vscode.workspace)
    when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
      .thenReturn({ get: (section: string) => testFramework } as vscode.WorkspaceConfiguration)
  }

  suite('#getTestFramework()', function() {
    test('should return rspec when configuration set to rspec', function() {
      let testFramework = "rspec"
      setConfig(testFramework)

      expect(Config.getTestFramework(log)).to.eq(testFramework);
    });

    test('should return minitest when configuration set to minitest', function() {
      let testFramework = 'minitest'
      setConfig(testFramework)

      expect(Config.getTestFramework(log)).to.eq(testFramework);
    });

    test('should return none when configuration set to none', function() {
      let testFramework = 'none'
      setConfig(testFramework)

      expect(Config.getTestFramework(log)).to.eq(testFramework);
    });
  });

  suite("Rspec specific tests", function() {
    const configSection: { get(section: string): any | undefined } | undefined = {
      get: (section: string) => {
        switch (section) {
          case "framework":
            return "rspec"
          case "filePattern":
            return ['*_test.rb', 'test_*.rb']
          default:
            return undefined
        }
      }
    }

    test("#getTestCommandWithFilePattern", function() {
      let spiedWorkspace = spy(vscode.workspace)
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
          .thenReturn(configSection as vscode.WorkspaceConfiguration)
      let config = new RspecConfig(path.resolve('ruby'))
      expect(config.getTestCommandWithFilePattern()).to
        .eq("bundle exec rspec --pattern 'spec/**/*_test.rb,spec/**/test_*.rb'")
    })

    suite("#getRelativeTestDirectory()", function() {
      test("with no config set, it returns default value", function() {
        let config = new RspecConfig(path.resolve('ruby'))
        expect(config.getRelativeTestDirectory()).to.eq("spec/")
      })
    })

    suite('#getAbsoluteTestDirectory()', function () {
      test('returns path to workspace with relative path appended', function () {
        let config = new RspecConfig(path.resolve('ruby'))
        expect(config.getAbsoluteTestDirectory()).to.eq(path.resolve('spec'))
      })
    })
  })
});
