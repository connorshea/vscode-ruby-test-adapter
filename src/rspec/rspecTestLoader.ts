import { TestLoader } from '../testLoader';
import * as vscode from 'vscode';
import * as path from 'path';

export class RspecTestLoader extends TestLoader {
  protected frameworkName(): string {
      return "RSpec"
  }

  protected getFrameworkTestDirectory(): string {
    let configDir = vscode.workspace.getConfiguration('rubyTestExplorer', null).get('rspecDirectory') as string
    return configDir ?? path.join('.', 'spec');
  }
}