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

  let rspecMetadata = JSON.parse(output);

  let testSuite: TestSuiteInfo = {
    type: 'suite',
    id: 'root',
    label: 'Rspec',
    children: []
  };

  console.log(rspecMetadata.examples);

  // TODO: Turn this into a proper structure for the TestSuiteInfo object.
  //
  // p = proc do {|h, k| h[k] = Hash.new(&p) }
  // hash = Hash.new(&p)
  // items.each do |item|
  //   nested = item.location.reduce(hash){|memo, curr| memo[curr]}
  // end
  let test_array = rspecMetadata.examples.map((test: { id: string; file_path: any; }) => {
    let test_location = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]"));
    let temp_test_location_array = test_location.split(':');
    let test_location_array = temp_test_location_array.map((x: string) => {
      return parseInt(x);
    });

    return {
      file: test.file_path,
      location: test_location_array
    }
  });

  console.log('Original array of tests.');
  console.log(test_array);

  let tests: Array<{ id: string; full_description: string; description: string; file_path: string; line_number: number; location: number; }> = [];

  rspecMetadata.examples.forEach((test: { id: string; full_description: string; description: string; file_path: string; line_number: number; location: number; }) => {
    let test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
    let test_location_string: string = test_location_array.join('');
    test.location = parseInt(test_location_string);

    tests.push(test);
  });

  console.log('Array of tests with location.');
  console.log(tests);

  let uniqueFiles = [...new Set(tests.map((test: { file_path: string; }) => test.file_path))];

  uniqueFiles.forEach((current_file: string) => {
    let current_file_tests = tests.filter(test => {
      return test.file_path === current_file
    });

    let current_file_tests_info = current_file_tests as unknown as Array<TestInfo>;
    current_file_tests_info.forEach((test: TestInfo) => {
      test.type = 'test';
      test.label = '';
    });

    console.log(JSON.stringify(current_file_tests_info));
    
    let current_file_test_info_array: Array<TestInfo> = current_file_tests_info.map((test: { file_path: string; id: string; description: string; full_description: string; line_number: number; }) => {
      // Concatenation of "/Users/username/whatever/project_dir" and "./spec/path/here.rb", but with the latter's first character stripped.
      let file_path: string = `${vscode.workspace.rootPath}${test.file_path.substr(1)}`;
      
      let temp_test_location_array: Array<string> = test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':');
      let test_location_array: Array<number> = temp_test_location_array.map((x: string) => {
        return parseInt(x);
      });
      
      // Get the last element in the location array.
      let test_number: number = test_location_array[test_location_array.length - 1];
      let description: string = test.description.startsWith('example at ') ? `Test #${test_number}` : test.full_description;

      let testInfo: TestInfo = {
        type: 'test',
        id: test.id,
        label: description,
        file: file_path,
        // Line numbers are 0-indexed... for some reason.
        line: test.line_number - 1
      }

      return testInfo;
    });

    let currentFileTestSuite: TestSuiteInfo = {
      type: 'suite',
      id: current_file,
      label: current_file,
      children: current_file_test_info_array
    }

    testSuite.children.push(currentFileTestSuite);
  });

  // NOTE: This will only work if everything is nested at the same level,
  // e.g. 111, 112, 121, etc. Once a fourth level of indentation is
  // introduced, the location is generated as e.g. 1231, which won't
  // sort properly.
  tests.sort((a: { location: number }, b: { location: number }) => {
    return a.location - b.location;
  })

  return Promise.resolve<TestSuiteInfo>(testSuite);
}

export async function runRspecTests(
  tests: string[],
  testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {
  // TODO: Fix this.
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
