import { Config } from '../config';
import * as vscode from 'vscode'
import * as path from 'path';

export class RspecConfig extends Config {
  readonly DEFAULT_TEST_DIRECTORY = 'spec'

  public frameworkName(): string {
    return "RSpec"
  }

  /**
   * Get the user-configured RSpec command, if there is one.
   *
   * @return The RSpec command
   */
  public getTestCommand(): string {
    let command: string =
      vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string;
    return command || `bundle exec rspec`
  }

  /**
   * Get the user-configured rdebug-ide command, if there is one.
   *
   * @return The rdebug-ide command
   */
  public getDebugCommand(debuggerConfig: vscode.DebugConfiguration, args: string): string {
    let command: string =
      (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('debugCommand') as string) ||
      'rdebug-ide';

    return (
      `${command} --host ${debuggerConfig.remoteHost} --port ${debuggerConfig.remotePort}` +
      ` -- ${process.platform == 'win32' ? '%EXT_DIR%' : '$EXT_DIR'}/debug_rspec.rb ${args}`
    );
  }

  /**
   * Get the user-configured RSpec command and add file pattern detection.
   *
   * @return The RSpec command
   */
  public getFilePatternArg(): string {
    const dir = this.getRelativeTestDirectory().replace(/\/$/, "");
    let pattern = this.getFilePattern().map(p => `${dir}/**{,/*/**}/${p}`).join(',')
    return `--pattern '${pattern}'`;
  }

  /**
   * Get the absolute path of the custom_formatter.rb file.
   *
   * @return The spec directory
   */
  public getCustomFormatterLocation(): string {
    return path.join(this.rubyScriptPath, '/custom_formatter.rb');
  }

  /**
   * Get test command with formatter and debugger arguments
   *
   * @param debugConfiguration A VS Code debugger configuration.
   * @return The test command
   */
  public testCommandWithFormatterAndDebugger(debugConfiguration?: vscode.DebugConfiguration): string {
    let args = `--require ${this.getCustomFormatterLocation()} --format CustomFormatter`
    let cmd = `${this.getTestCommand()} ${args}`
    if (debugConfiguration) {
      cmd = this.getDebugCommand(debugConfiguration, args);
    }
    return cmd
  }

  public getTestArguments(testItems?: readonly vscode.TestItem[]): string[] {
    if (!testItems) return [this.getFilePatternArg()]

    let args: string[] = []
    for (const testItem of testItems) {
      if (testItem.id.includes('[')) {
        let locationStartIndex = testItem.id.lastIndexOf('[') + 1
        let locationEndIndex = testItem.id.lastIndexOf(']')
        args.push(`${testItem.uri!.fsPath}[${testItem.id.slice(locationStartIndex, locationEndIndex)}]`)
      } else {
        args.push(testItem.uri!.fsPath)
      }
    }
    return args
  }

  public getRunTestsCommand(debugConfiguration?: vscode.DebugConfiguration): string {
    return this.testCommandWithFormatterAndDebugger(debugConfiguration)
  };

  public getResolveTestsCommand(testItems?: readonly vscode.TestItem[]): string {
    return `${this.testCommandWithFormatterAndDebugger()} --order defined --dry-run`;
  }

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  public getProcessEnv(): any {
    return Object.assign({}, process.env, {
      "EXT_DIR": this.rubyScriptPath,
    });
  }

  public getRelativeTestDirectory(): string {
    let configDir = vscode.workspace.getConfiguration('rubyTestExplorer').get('rspecDirectory') as string
    if (!configDir)
      return this.DEFAULT_TEST_DIRECTORY

    if (configDir.startsWith('./'))
      configDir = configDir.substring(2)
    return configDir ?? this.DEFAULT_TEST_DIRECTORY;
  }
}
