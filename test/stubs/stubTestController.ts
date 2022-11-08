import * as vscode from 'vscode'
import { StubTestItemCollection } from './stubTestItemCollection';
import { StubTestItem } from './stubTestItem';
import { instance, mock } from 'ts-mockito';

export class StubTestController implements vscode.TestController {
  id: string = "stub_test_controller_id";
  label: string = "stub_test_controller_label";
  items: vscode.TestItemCollection = new StubTestItemCollection();
  mockTestRun: vscode.TestRun | undefined

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
    this.mockTestRun = mock<vscode.TestRun>()
    return instance(this.mockTestRun)
  }

  createTestItem(id: string, label: string, uri?: vscode.Uri): vscode.TestItem {
    return new StubTestItem(id, label, uri)
  }

  dispose = () => {}

  getMockTestRun(): vscode.TestRun {
    if (this.mockTestRun)
      return this.mockTestRun
    throw new Error("No test run")
  }

}