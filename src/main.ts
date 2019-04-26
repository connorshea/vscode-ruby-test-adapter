import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { RubyAdapter } from './adapter';

export async function activate(context: vscode.ExtensionContext) {

  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

  // create a simple logger that can be configured with the configuration variables
  // `rubyExplorer.logpanel` and `rubyExplorer.logfile`
  const log = new Log('rubyExplorer', workspaceFolder, 'Ruby Explorer Log');
  context.subscriptions.push(log);

  // get the Test Explorer extension
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
  if (log.enabled) log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);

  if (testExplorerExtension) {

    const testHub = testExplorerExtension.exports;

    // this will register an RubyTestAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
      testHub,
      workspaceFolder => new RubyAdapter(workspaceFolder, log),
      log
    ));
  }
}
