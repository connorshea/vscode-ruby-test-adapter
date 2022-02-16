import { TestLoader } from '../testLoader';
import * as vscode from 'vscode';
import * as path from 'path';

export class MinitestTestLoader extends TestLoader {
  protected frameworkName(): string {
      return "Minitest"
  }

  protected getFrameworkTestDirectory(): string {
    return (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('minitestDirectory') as string)
      || path.join('.', 'test');
  }
}