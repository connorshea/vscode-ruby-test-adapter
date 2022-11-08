import { noop_logger } from "../helpers";
import { spy, when } from 'ts-mockito'
import * as vscode from 'vscode'
import { Config } from "../../../src/config";
import { RspecConfig } from "../../../src/rspec/rspecConfig";
import { expect } from "chai";

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

      expect(Config.getTestFramework(noop_logger())).to.eq(testFramework);
    });

    test('should return minitest when configuration set to minitest', function() {
      let testFramework = 'minitest'
      setConfig(testFramework)

      expect(Config.getTestFramework(noop_logger())).to.eq(testFramework);
    });

    test('should return none when configuration set to none', function() {
      let testFramework = 'none'
      setConfig(testFramework)

      expect(Config.getTestFramework(noop_logger())).to.eq(testFramework);
    });
  });

  suite("Rspec specific tests", function() {
    test("#getTestCommandWithFilePattern", function() {
      const spiedWorkspace = spy(vscode.workspace)
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
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
          .thenReturn(configSection as vscode.WorkspaceConfiguration)

      let config = new RspecConfig("../../../ruby")
      expect(config.getTestCommandWithFilePattern()).to
        .eq("bundle exec rspec --pattern './spec/**/*_test.rb,./spec/**/test_*.rb'")
    })

    suite("#getTestDirectory()", function() {
      test("with no config set, it returns ./spec", function() {
        let config = new RspecConfig("../../../ruby")
        expect(config.getTestDirectory()).to.eq("./spec")
      })
    })
  })
});