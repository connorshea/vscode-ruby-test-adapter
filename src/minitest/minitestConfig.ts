import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from "../config";

export class MinitestConfig extends Config {
  public frameworkName(): string {
      return "Minitest"
  }

  /**
   * Get the user-configured Minitest command, if there is one.
   *
   * @return The Minitest command
   */
  public getTestCommand(): string {
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestCommand') as string) || 'bundle exec rake';
    return `${command} -R ${this.rubyScriptPath}`;
  }

  /**
   * Get the user-configured rdebug-ide command, if there is one.
   *
   * @return The rdebug-ide command
   */
  public getDebugCommand(debuggerConfig: vscode.DebugConfiguration): string {
    let command: string =
      (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('debugCommand') as string) ||
      'rdebug-ide';

    return (
      `${command}  --host ${debuggerConfig.remoteHost} --port ${debuggerConfig.remotePort}` +
      ` -- ${this.rubyScriptPath}/debug_minitest.rb`
    );
  }

  /**
   * Get test command with formatter and debugger arguments
   *
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The test command
   */
  public testCommandWithDebugger(debuggerConfig?: vscode.DebugConfiguration): string {
    let cmd = `${this.getTestCommand()} vscode:minitest:run`
    if (debuggerConfig) {
      cmd = this.getDebugCommand(debuggerConfig);
    }
    return cmd;
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The test directory
   */
  public getRelativeTestDirectory(): string {
    return (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string)
      || path.join('.', 'test');
  }

  public getTestArguments(testItems?: readonly vscode.TestItem[]): string[] {
    if (!testItems) return []

    let args: string[] = []
    for (const testItem of testItems) {
      if (testItem.id.includes('[')) {
        args.push(`${testItem.uri!.fsPath}:${testItem.range!.start.line + 1}`)
      } else {
        args.push(testItem.uri!.fsPath)
      }
    }
    return args
  }

  public getRunTestsCommand(debugConfiguration?: vscode.DebugConfiguration): string {
    return this.testCommandWithDebugger(debugConfiguration)
  };

  public getResolveTestsCommand(testItems?: readonly vscode.TestItem[]): string {
    return `${this.getTestCommand()} vscode:minitest:list`
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
      "TESTS_DIR": this.getRelativeTestDirectory(),
      "TESTS_PATTERN": this.getFilePattern().join(',')
    });
  }
}
