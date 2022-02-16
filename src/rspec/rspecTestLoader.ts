import { TestLoader } from '../testLoader';
import * as vscode from 'vscode';
import * as path from 'path';

export class RspecTestLoader extends TestLoader {
  protected frameworkName(): string {
      return "RSpec"
  }

  protected getFrameworkTestDirectory(): string {
    return (vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecDirectory') as string)
      || path.join('.', 'spec');
  }
}