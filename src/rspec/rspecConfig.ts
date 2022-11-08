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
    let command: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecCommand') as string);
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
  public getTestCommandWithFilePattern(): string {
    let command: string = this.getTestCommand()
    const dir = this.getTestDirectory().replace(/\/$/, "");
    let pattern = this.getFilePattern().map(p => `${dir}/**/${p}`).join(',')
    return `${command} --pattern '${pattern}'`;
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
   * @param debuggerConfig A VS Code debugger configuration.
   * @return The test command
   */
  public testCommandWithFormatterAndDebugger(debuggerConfig?: vscode.DebugConfiguration): string {
    let args = `--require ${this.getCustomFormatterLocation()} --format CustomFormatter`
    let cmd = `${this.getTestCommand()} ${args}`
    if (debuggerConfig) {
      cmd = this.getDebugCommand(debuggerConfig, args);
    }
    return cmd
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

  public getTestDirectory(): string {
    let configDir = vscode.workspace.getConfiguration('rubyTestExplorer').get('rspecDirectory') as string
    if (!configDir)
      return this.DEFAULT_TEST_DIRECTORY

    if (configDir.startsWith('./'))
      configDir = configDir.substring(2)
    return configDir ?? this.DEFAULT_TEST_DIRECTORY;
  }
}