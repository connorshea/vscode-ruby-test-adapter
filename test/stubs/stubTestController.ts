import * as vscode from 'vscode'
import { instance, mock, when } from 'ts-mockito';

import { StubTestItemCollection } from './stubTestItemCollection';
import { StubTestItem } from './stubTestItem';
import { IChildLogger } from '@vscode-logging/logger';

export class StubTestController implements vscode.TestController {
  id: string = "stub_test_controller_id";
  label: string = "stub_test_controller_label";
  items: vscode.TestItemCollection
  testRuns: Map<string, vscode.TestRun> = new Map<string, vscode.TestRun>()
  readonly rootLog: IChildLogger
  readonly cancellationTokenSource = new vscode.CancellationTokenSource()

  constructor(readonly log: IChildLogger) {
    this.rootLog = log
    this.items = new StubTestItemCollection(log, this);
  }

  createRunProfile(
    label: string,
    kind: vscode.TestRunProfileKind,
    runHandler: (request: vscode.TestRunRequest, token: vscode.CancellationToken) => void | Thenable<void>,
    isDefault?: boolean,
    tag?: vscode.TestTag
  ): vscode.TestRunProfile {
    return instance(mock<vscode.TestRunProfile>())
  }

  resolveHandler?: ((item: vscode.TestItem | undefined) => void | Thenable<void>) | undefined;

  refreshHandler: ((token: vscode.CancellationToken) => void | Thenable<void>) | undefined;

  createTestRun(
    request: vscode.TestRunRequest,
    name?: string,
    persist?: boolean
  ): vscode.TestRun {
    let mockTestRun = mock<vscode.TestRun>()
    this.testRuns.set(request.profile!.label, mockTestRun)
    when(mockTestRun.token).thenReturn(this.cancellationTokenSource.token)
    return instance(mockTestRun)
  }

  createTestItem(id: string, label: string, uri?: vscode.Uri): vscode.TestItem {
    return new StubTestItem(this.rootLog, this, id, label, uri)
  }

  getMockTestRun(request: vscode.TestRunRequest): vscode.TestRun | undefined {
    return this.testRuns.get(request.profile!.label)
  }

  dispose = () => {}

}