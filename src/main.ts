import vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { RubyAdapter } from './adapter';

export async function activate(context: vscode.ExtensionContext) {
  // Determine whether to send the logger a workspace.
  let logWorkspaceFolder = (vscode.workspace.workspaceFolders || [])[0]; 
  // create a simple logger that can be configured with the configuration variables
  // `rubyTestExplorer.logpanel` and `rubyTestExplorer.logfile`
  let log = new Log('rubyTestExplorer', logWorkspaceFolder, 'Ruby Test Explorer Log');
  context.subscriptions.push(log);

  // get the Test Explorer extension
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
  if (log.enabled) {
    log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);
  }

  let testFramework: string = vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testFramework') || 'none';

  if (testExplorerExtension && testFramework !== "none") {
    const testHub = testExplorerExtension.exports;

    // this will register a RubyTestAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
      testHub,
      workspaceFolder => new RubyAdapter(workspaceFolder, log, context),
      log
    ));
  }
}
