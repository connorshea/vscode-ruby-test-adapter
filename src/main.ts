import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { RubyAdapter } from './adapter';

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

  // create a simple logger that can be configured with the configuration variables
  // `rubyTestExplorer.logpanel` and `rubyTestExplorer.logfile`
  const log = new Log('rubyTestExplorer', workspaceFolder, 'Ruby Test Explorer Log');
  context.subscriptions.push(log);

  // get the Test Explorer extension
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
  if (log.enabled) {
    log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);
  }

  let testingFramework: string = (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('testingFramework') as string) || 'none';

  if (testExplorerExtension && testingFramework !== "none") {
    const testHub = testExplorerExtension.exports;

    // this will register a RubyTestAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
      testHub,
      workspaceFolder => new RubyAdapter(workspaceFolder, log, context),
      log
    ));
  }
}
