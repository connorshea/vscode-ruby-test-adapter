import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { IVSCodeExtLogger } from '@vscode-logging/logger';

export abstract class Config {

  public readonly rubyScriptPath: string;

  constructor(context: vscode.ExtensionContext | string) {
    if (typeof context === "object") {
      this.rubyScriptPath = vscode.Uri.joinPath(context?.extensionUri ?? vscode.Uri.file("./"), 'ruby').fsPath;
    } else {
      this.rubyScriptPath = (context as string)
    }
  }

  /**
   * Printable name of the test framework
   */
  public abstract frameworkName(): string

  /**
   * Get the user-configured test file pattern.
   *
   * @return The file pattern
   */
  public getFilePattern(): Array<string> {
    let pattern: Array<string> = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('filePattern') as Array<string>);
    return pattern || ['*_test.rb', 'test_*.rb'];
  }

  /**
   * Get the user-configured test directory, if there is one.
   *
   * @return The test directory
   */
  public abstract getTestDirectory(): string;

  /**
   * Get the env vars to run the subprocess with.
   *
   * @return The env
   */
  public abstract getProcessEnv(): any

  public static getTestFramework(log: IVSCodeExtLogger): string {
    let testFramework: string = vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testFramework') || '';
    // If the test framework is something other than auto, return the value.
    if (['rspec', 'minitest', 'none'].includes(testFramework)) {
      return testFramework;
      // If the test framework is auto, we need to try to detect the test framework type.
    } else {
      return this.detectTestFramework(log);
    }
  }

  /**
   * Detect the current test framework using 'bundle list'.
   */
  private static detectTestFramework(log: IVSCodeExtLogger): string {
    log.info(`Getting a list of Bundler dependencies with 'bundle list'.`);

    const execArgs: childProcess.ExecOptions = {
      cwd: (vscode.workspace.workspaceFolders || [])[0].uri.fsPath,
      maxBuffer: 8192 * 8192
    };

    try {
      // Run 'bundle list' and set the output to bundlerList.
      // Execute this syncronously to avoid the test explorer getting stuck loading.
      let err, stdout = childProcess.execSync('bundle list', execArgs);

      if (err) {
        log.error(`Error while listing Bundler dependencies: ${err}`);
        log.error(`Output: ${stdout}`);
        throw err;
      }

      let bundlerList = stdout.toString();

      // Search for rspec or minitest in the output of 'bundle list'.
      // The search function returns the index where the string is found, or -1 otherwise.
      if (bundlerList.search('rspec-core') >= 0) {
        log.info(`Detected RSpec test framework.`);
        return 'rspec';
      } else if (bundlerList.search('minitest') >= 0) {
        log.info(`Detected Minitest test framework.`);
        return 'minitest';
      } else {
        log.info(`Unable to automatically detect a test framework.`);
        return 'none';
      }
    } catch (error: any) {
      log.error(error);
      return 'none';
    }
  }
}