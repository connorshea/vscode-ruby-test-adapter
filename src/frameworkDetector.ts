import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { IVSCodeExtLogger } from '@vscode-logging/logger';

export function getTestFramework(_log: IVSCodeExtLogger): string {
  let testFramework: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testFramework') as string);
  // If the test framework is something other than auto, return the value.
  if (['rspec', 'minitest', 'none'].includes(testFramework)) {
    return testFramework;
    // If the test framework is auto, we need to try to detect the test framework type.
  } else {
    return detectTestFramework(_log);
  }
}

/**
 * Detect the current test framework using 'bundle list'.
 */
function detectTestFramework(_log: IVSCodeExtLogger): string {
  _log.info(`Getting a list of Bundler dependencies with 'bundle list'.`);

  const execArgs: childProcess.ExecOptions = {
    cwd: (vscode.workspace.workspaceFolders || [])[0].uri.fsPath,
    maxBuffer: 8192 * 8192
  };

  try {
    // Run 'bundle list' and set the output to bundlerList.
    // Execute this syncronously to avoid the test explorer getting stuck loading.
    let err, stdout = childProcess.execSync('bundle list', execArgs);

    if (err) {
      _log.error(`Error while listing Bundler dependencies: ${err}`);
      _log.error(`Output: ${stdout}`);
      throw err;
    }

    let bundlerList = stdout.toString();

    // Search for rspec or minitest in the output of 'bundle list'.
    // The search function returns the index where the string is found, or -1 otherwise.
    if (bundlerList.search('rspec-core') >= 0) {
      _log.info(`Detected RSpec test framework.`);
      return 'rspec';
    } else if (bundlerList.search('minitest') >= 0) {
      _log.info(`Detected Minitest test framework.`);
      return 'minitest';
    } else {
      _log.info(`Unable to automatically detect a test framework.`);
      return 'none';
    }
  } catch (error: any) {
    _log.error(error);
    return 'none';
  }
}
