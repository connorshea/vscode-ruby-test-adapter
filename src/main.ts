import * as vscode from 'vscode';
import { getExtensionLogger, IChildLogger } from "@vscode-logging/logger";
import { TestFactory } from './testFactory';
import { RspecConfig } from './rspec/rspecConfig';
import { MinitestConfig } from './minitest/minitestConfig';
import { Config } from './config';

export const guessWorkspaceFolder = async (rootLog: IChildLogger) => {
  let log = rootLog.getChildLogger({ label: "guessWorkspaceFolder: " })
  if (!vscode.workspace.workspaceFolders) {
    return undefined;
  }

  console.debug("Found workspace folders:")
  log.debug("Found workspace folders:")
  for (const folder of vscode.workspace.workspaceFolders) {
    console.debug(` - ${folder.uri.fsPath}`)
    log.debug(` - ${folder.uri.fsPath}`)
  }

  if (vscode.workspace.workspaceFolders.length < 2) {
    return vscode.workspace.workspaceFolders[0];
  }

  for (const folder of vscode.workspace.workspaceFolders) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'src/vs/loader.js'));
      return folder;
    } catch {
      // ignored
    }
  }

  return undefined;
};

export async function activate(context: vscode.ExtensionContext) {
  let extensionConfig = vscode.workspace.getConfiguration('rubyTestExplorer', null)

  const log = getExtensionLogger({
    extName: "RubyTestExplorer",
    level: "debug", // See LogLevel type in @vscode-logging/types for possible logLevels
    logPath: context.logUri.fsPath, // The logPath is only available from the `vscode.ExtensionContext`
    logOutputChannel: vscode.window.createOutputChannel("Ruby Test Explorer log"), // OutputChannel for the logger
    sourceLocationTracking: false,
    logConsole: (extensionConfig.get('logPanel') as boolean) // define if messages should be logged to the consol
  });
  if (vscode.workspace.workspaceFolders == undefined) {
    log.error("No workspace opened")
  }

  const workspace: vscode.WorkspaceFolder | undefined = await guessWorkspaceFolder(log);
  let testFramework: string = Config.getTestFramework(log);

  let testConfig = testFramework == "rspec"
    ? new RspecConfig(context, workspace)
    : new MinitestConfig(context, workspace)

  const debuggerConfig: vscode.DebugConfiguration = {
    name: "Debug Ruby Tests",
    type: "Ruby",
    request: "attach",
    remoteHost: extensionConfig.get('debuggerHost') || "127.0.0.1",
    remotePort: extensionConfig.get('debuggerPort') || "1234",
    remoteWorkspaceRoot: "${workspaceRoot}"
  }

  if (testFramework !== "none") {
    const controller = vscode.tests.createTestController('ruby-test-explorer', 'Ruby Test Explorer');

    // TODO: (?) Add a "Profile" profile for profiling tests
    let profiles: { runProfile: vscode.TestRunProfile, resolveTestsProfile: vscode.TestRunProfile, debugProfile: vscode.TestRunProfile } = {
      // Default run profile for running tests
      runProfile: controller.createRunProfile(
        'Run',
        vscode.TestRunProfileKind.Run,
        (request, token) => testLoaderFactory.getRunner().runHandler(request, token),
        true // Default run profile
      ),

      // Run profile for dry runs/getting test details
      resolveTestsProfile: controller.createRunProfile(
        'ResolveTests',
        vscode.TestRunProfileKind.Run,
        (request, token) => testLoaderFactory.getRunner().runHandler(request, token),
        false
      ),

      // Run profile for debugging tests
      debugProfile: controller.createRunProfile(
        'Debug',
        vscode.TestRunProfileKind.Debug,
        (request, token) => testLoaderFactory.getRunner().runHandler(request, token, debuggerConfig),
        true
      ),
    }

    const testLoaderFactory = new TestFactory(log, controller, testConfig, profiles, workspace);
    context.subscriptions.push(controller);

    testLoaderFactory.getLoader().discoverAllFilesInWorkspace();

    controller.resolveHandler = async test => {
      log.debug('resolveHandler called', test)
      if (!test) {
        await testLoaderFactory.getLoader().discoverAllFilesInWorkspace();
      } else if (test.id.endsWith(".rb")) {
        // Only parse files
        await testLoaderFactory.getLoader().parseTestsInFile(test);
      }
    };
  }
  else {
    log.fatal('No test framework detected. Configure the rubyTestExplorer.testFramework setting if you want to use the Ruby Test Explorer.');
  }
}
