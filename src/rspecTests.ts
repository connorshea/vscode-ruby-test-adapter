import * as vscode from 'vscode';
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import * as childProcess from 'child_process';

const rspecTests = async () => new Promise<string>((resolve, reject) => {
  let cmd = `bundle exec rspec --format json --dry-run`;

  const execArgs: childProcess.ExecOptions = {
    cwd: vscode.workspace.rootPath,
    maxBuffer: 400 * 1024
  };

  childProcess.exec(cmd, execArgs, (err, stdout) => {
    if (err) {
      return reject(err);
    }
    resolve(stdout);
  });
});

export async function loadRspecTests(): Promise<TestSuiteInfo> {
  let output = await rspecTests();

  output = output.substring(output.indexOf("{"), output.lastIndexOf("}") + 1);

  console.log(output);

  let rspecMetadata = JSON.parse(output);

  let testSuite: TestSuiteInfo = {
    type: 'suite',
    id: 'root',
    label: 'Rspec',
    children: []
  };

  console.log(rspecMetadata);

  testSuite.children.push();

  return Promise.resolve<TestSuiteInfo>(testSuite);
}

export async function runRspecTests(
  tests: string[],
  testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {
  let thing: TestInfo = {
    id: 'root',
    label: 'Rspec',
    type: 'test'
  };
  for (const suiteOrTestId of tests) {
    const node = findNode(thing, suiteOrTestId);
    if (node) {
      await runNode(node, testStatesEmitter);
    }
  }
}

function findNode(searchNode: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
  if (searchNode.id === id) {
    return searchNode;
  } else if (searchNode.type === 'suite') {
    for (const child of searchNode.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

async function runNode(
  node: TestSuiteInfo | TestInfo,
  testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {

  if (node.type === 'suite') {

    testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'running' });

    for (const child of node.children) {
      await runNode(child, testStatesEmitter);
    }

    testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

  } else { // node.type === 'test'

    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });

    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'passed' });

  }
}
