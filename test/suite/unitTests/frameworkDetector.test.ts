import { NOOP_LOGGER } from "../../stubs/noopLogger";
import { spy, when } from 'ts-mockito'
import * as vscode from 'vscode'
import { getTestFramework } from "../../../src/frameworkDetector";

var assert = require('assert')

suite('frameworkDetector', function() {
  suite('#getTestFramework()', function() {
    let testFramework = ''
    const spiedWorkspace = spy(vscode.workspace)
    const configSection: { get(section: string): string | undefined } | undefined = {
      get: (section: string) => testFramework
    }

    test('should return rspec when configuration set to rspec', function() {
      testFramework = 'rspec'
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
        .thenReturn(configSection as vscode.WorkspaceConfiguration)

      assert.equal(getTestFramework(NOOP_LOGGER), testFramework);
    });

    test('should return minitest when configuration set to minitest', function() {
      testFramework = 'minitest'
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
        .thenReturn(configSection as vscode.WorkspaceConfiguration)

      assert.equal(getTestFramework(NOOP_LOGGER), testFramework);
    });

    test('should return none when configuration set to none', function() {
      testFramework = 'none'
      when(spiedWorkspace.getConfiguration('rubyTestExplorer', null))
        .thenReturn(configSection as vscode.WorkspaceConfiguration)

      assert.equal(getTestFramework(NOOP_LOGGER), testFramework);
    });
  });
});
