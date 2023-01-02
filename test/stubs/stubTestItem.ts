import { IChildLogger } from '@vscode-logging/logger';
import * as vscode from 'vscode'

import { StubTestItemCollection } from './stubTestItemCollection';

export class StubTestItem implements vscode.TestItem {
  id: string;
  uri: vscode.Uri | undefined;
  children: vscode.TestItemCollection;
  parent: vscode.TestItem | undefined;
  tags: readonly vscode.TestTag[];
  canResolveChildren: boolean;
  busy: boolean;
  label: string;
  description: string | undefined;
  range: vscode.Range | undefined;
  error: string | vscode.MarkdownString | undefined;

  constructor(rootLog: IChildLogger, controller: vscode.TestController, id: string, label: string, uri?: vscode.Uri) {
    this.id = id
    this.label = label
    this.uri = uri
    this.children = new StubTestItemCollection(rootLog, controller, this)
    this.tags = []
    this.canResolveChildren = false
    this.busy = false
  }
}