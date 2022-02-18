import * as vscode from 'vscode';
import { getExtensionLogger } from "@vscode-logging/logger";
import { getTestFramework } from './frameworkDetector';
import { TestFactory } from './testFactory';

export async function activate(context: vscode.ExtensionContext) {
  let config = vscode.workspace.getConfiguration('rubyTestExplorer', null)
    
  const log = getExtensionLogger({
    extName: "RubyTestExplorer",
    level: "info", // See LogLevel type in @vscode-logging/types for possible logLevels
    logPath: context.logUri.fsPath, // The logPath is only available from the `vscode.ExtensionContext`
    logOutputChannel: vscode.window.createOutputChannel("Ruby Test Explorer log"), // OutputChannel for the logger
    sourceLocationTracking: false,
    logConsole: (config.get('logPanel') as boolean) // define if messages should be logged to the consol
  });
  if (vscode.workspace.workspaceFolders == undefined) {
    log.error("No workspace opened")
  }

  const workspace: vscode.WorkspaceFolder | null = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders[0]
    : null;
  let testFramework: string = getTestFramework(log);

  const debuggerConfig: vscode.DebugConfiguration = {
    name: "Debug Ruby Tests",
    type: "Ruby",
    request: "attach",
    remoteHost: config.get('debuggerHost') || "127.0.0.1",
    remotePort: config.get('debuggerPort') || "1234",
    remoteWorkspaceRoot: "${workspaceRoot}"
  }

  if (testFramework !== "none") {
    const controller = vscode.tests.createTestController('ruby-test-explorer', 'Ruby Test Explorer');
    const testLoaderFactory = new TestFactory(log, context, workspace, controller);
    context.subscriptions.push(controller);

    testLoaderFactory.getLoader().loadAllTests();

    // TODO: Allow lazy-loading of child tests - below is taken from example in docs
    // Custom handler for loading tests. The "test" argument here is undefined,
    // but if we supported lazy-loading child test then this could be called with
    // the test whose children VS Code wanted to load.
    // controller.resolveHandler = test => {
    //   controller.items.replace([]);
    // };

    // TODO: (?) Add a "Profile" profile for profiling tests
    controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => testLoaderFactory.getRunner().runHandler(request, token),
      true // Default run profile
    );
    controller.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => testLoaderFactory.getRunner().runHandler(request, token, debuggerConfig)
    );
  }
  else {
    log.fatal('No test framework detected. Configure the rubyTestExplorer.testFramework setting if you want to use the Ruby Test Explorer.');
  }
}
