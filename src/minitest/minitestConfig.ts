import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from "../config";

export class MinitestConfig extends Config {
  public frameworkName(): string {
      return "Minitest"
  }

  public getFrameworkTestDirectory(): string {
    return (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string)
      || path.join('.', 'test');
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The test directory
   */
  public getTestDirectory(): string {
    let directory: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string);
    return directory || './test/';
  }

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  public getProcessEnv(): any {
    return Object.assign({}, process.env, {
      "RAILS_ENV": "test",
      "EXT_DIR": this.rubyScriptPath,
      "TESTS_DIR": this.getTestDirectory(),
      "TESTS_PATTERN": this.getFilePattern().join(',')
    });
  }
}