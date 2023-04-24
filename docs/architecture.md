# Architecture

This extension is essentially comprised of 4 main parts:

- [Configuration and setup](#configuration-and-setup)
- [Management of the test tree state](#management-of-the-test-tree-state)
- [Discovering tests](#discovering-tests)
  - [1. File changes](#1-file-changes)
  - [2. Resolve handler](#2-resolve-handler)
  - [Loading queue](#loading-queue)
- [Running tests](#running-tests)

As much as possible, anything that might need to be cleaned up or cancelled extends the [Disposable](https://code.visualstudio.com/api/references/vscode-api#Disposable) interface, so that it provides a clear, uniform way for other classes to do so.

## Configuration and setup

These parts of the extension are the most straightforward:

- `Config`
  - Abstract base class for test framework configuration.
  - Ensures that the rest of the extension does not need to care which test framework is being used when building commands to run, or getting file patterns, etc.
- `RspecConfig` & `MinitestConfig`
  - Framework-specific subclasses of `Config`.
  - Implement the abstract functions from `Config` as well as any other configuration/processing needed to supply the extension with the relevant data to interact correctly with their respective frameworks.
- `TestFactory`
  - Creates the `TestLoader` and `TestRunner` instances used by the extension.
  - Disposes of the `TestLoader` and `TestRunner` if necessary when the configuration changes, so that they clean up and terminate any running processes and can be recreated for the new configuration.
- `main.ts`
  - Extension entry point - called by VSCode to intialize the extension
  - Creates the logger, `TestController` (see [Management of the test tree state](#management-of-the-test-tree-state)), `TestFactory`, and `Config` instances
  - Creates the three [TestRunProfile](https://code.visualstudio.com/api/references/vscode-api#TestRunProfile) instances used by the extension (see [Running tests](#running-tests))
  - Creates the debug configuration used by the `Debug` profile
  - Registers the controller, factory and profiles with VSCode to be disposed of when the extension is unloaded
  - Registers a `resolveHandler` with the controller and initializes the `TestLoader` (see [Discovering tests](#discovering-tests))

## Management of the test tree state

There are only two classes that deal with this:

- [TestController](https://code.visualstudio.com/api/references/vscode-api#TestController)
  - Part of the VSCode API, and is the link between VSCode and this extension
- `TestSuiteManager`
  - Provides functions for the rest of the extension to use to update and access the test tree.

The [TestController](https://code.visualstudio.com/api/references/vscode-api#TestController) instance is the heart of the VSCode testing API:

- It is used to create [TestRunProfiles](https://code.visualstudio.com/api/references/vscode-api#TestRunProfile), which make it easy for tests to be run in different ways
- It is used to create [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) which represent the various folders, files, describes/contexts/groups, and tests
- It holds the list of known tests allowing them to be displayed in the UI, and run/discovered via the handler functions registered on the controller or the profiles created with it.
- It is used to create [TestRuns](https://code.visualstudio.com/api/references/vscode-api#TestRun) from [TestRunRequests](https://code.visualstudio.com/api/references/vscode-api#TestRunRequest), which are used for reporting the statuses of tests that are run, as well as grouping results.

The classes and functions provided by the VSCode API for managing the state of the test tree are, by necessity, very basic as they cannot predict what will be appropriate for any particular test provider. For example, the [TestItemCollection](https://code.visualstudio.com/api/references/vscode-api#TestItemCollection) used by the controller to hold the known tests cannot retrieve [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) that are children of the top-level items.

Because of this, as well as other constraints we must satisfy when using the testing API, and to make things easier in the rest of the extension, we have the `TestSuiteManager` class which keeps all the logic for managing a hierarchy of tests in a single place. It takes care of the following:

- Creating [TestItem](https://code.visualstudio.com/api/references/vscode-api#TestItem) instances to ensure that all the following constraints are always satisfied:
  - Test IDs must all be unique. We use the relative path to the test from the test folder root, and its location, e.g. for the second RSpec test in `./spec/foo/bar_spec.rb`, the ID would be `foo/bar_spec.rb[1:2]`.
  - Test item URIs are optional, but we want them to always be set with both the absolute file path and [Range](https://code.visualstudio.com/api/references/vscode-api#TestItem).
  - `canResolveChildren` should be `true` for all items that can have children which is non-trivial to determine.
  - Folders, files and some test groups don't get included in test framework output, so we need to ensure that all parent items are also created when an item needs creating.
- Retrieving [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem)
  - For the same reason that we need to create parents when creating items, we also have to walk the test tree to find a test item when needed.
- Deleting [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem)
  - To delete an item we also have to walk the tree to find the collection that contains it.
- Normalising IDs
  - Because we use the relative path to a test file as part of the ID, it's helpful to allow other classes to not have to worry about things like stripping leading `/`s, `./`s, etc

## Discovering tests

([VS Code API docs](https://code.visualstudio.com/api/extension-guides/testing#discovering-tests))

Discovering tests is done by the `TestLoader` class in two main ways:

### 1. File changes

When the `TestLoader` is created, or when the configuration that affects finding test files is changed, a set of [FileSystemWatchers](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher) are created using the configured file patterns.

1. When a file is created:
  A [TestItem](https://code.visualstudio.com/api/references/vscode-api#TestItem) is created for the new file and added to the tree.
2. When a file is changed:
  The [TestItem](https://code.visualstudio.com/api/references/vscode-api#TestItem) for the changed file is retrieved from the tree, and enqueued to be loaded by the test framework to get new/updated information about the tests within it.
3. When a file is deleted:
  The [TestItem](https://code.visualstudio.com/api/references/vscode-api#TestItem) for the deleted file is removed from the [TestItemCollection](https://code.visualstudio.com/api/references/vscode-api#TestItemCollection) that contains it, along with all its children.

### 2. Resolve handler

When the extension is initialized, a `resolveHandler` function is registered with the [TestController](https://code.visualstudio.com/api/references/vscode-api#TestController).

This function is called called whenever an item that may contain children is expanded in the test sidebar by clicking on the arrow icon, and is passed the relevant [TestItem](https://code.visualstudio.com/api/references/vscode-api#TestItem) from the tree as a parameter. This item is then enqueued to be loaded by the test framework.

This function It may also be called with no arguments to resolve all tests if a request to reload the entire tree is made, in which case the test framework is run immediately to load all tests.

### Loading queue

As mentioned, the `TestLoader` makes use of a queue for loading tests. The main reason for this is that the [FileSystemWatchers](https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher) only report changes one file at a time, and on large repositories this can easily result in hundreds of test processes being spawned in a short amount of time which will easily grind even powerful computers to a halt.

To avoid this, tests are added to a queue to be loaded, which behaves as follows:

- An async worker function checks the queue for [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) to run
  - If any are found, it:
    - Drains the queue, so that [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) enqueued while it is running don't get missed
    - Sets the `busy` flag on all the [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) - this causes a spinner to be displayed in the UI for those items.
    - Creates a [TestRunRequest](https://code.visualstudio.com/api/references/vscode-api#TestItem) containing the items to be loaded, using the `ResolveTests` profile and runs it with the profile's `runHandler` (see below) to load all the tests that were in the queue.
    - Once this is completed, it unsets the `busy` flag on the [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) and checks the queue for more items.
  - If the queue is empty, it creates a promise and waits for it to be resolved. Once resolved, it checks the queue again.
- When a test is added to the queue, if the async worker is waiting for items, the resolve function for the promise it is waiting on is resolved to notify it that items have been added.

This ensures that only one test process at a time is running to load tests.

## Running tests

([VS Code API docs](https://code.visualstudio.com/api/extension-guides/testing#running-tests))

When the extension is initialized (see [Configuration and setup](#configuration-and-setup)), three [TestRunProfiles](https://code.visualstudio.com/api/references/vscode-api#TestRunProfile) are registered with the controller:

- The `Run` profile, used for running tests (default profile for the `Run` [profile kind](https://code.visualstudio.com/api/references/vscode-api#TestRunProfileKind))
- The `Debug` profile, used for debugging tests (default profile for the `Debug` [profile kind](https://code.visualstudio.com/api/references/vscode-api#TestRunProfileKind))
- The `ResolveTests` profile, used for loading tests (using the `Run` [profile kind](https://code.visualstudio.com/api/references/vscode-api#TestRunProfileKind))
  - This profile can only be used internally by the extension, and is used by the `TestLoader` for loading tests

Note: There is a third possible profile kind, `Profile`, intended to be used for profiling tests that is not currently used by this extension.

When a user runs/debugs one or more tests from the UI, the `runHandler` function associated with the default profile for that [profile kind](https://code.visualstudio.com/api/references/vscode-api#TestRunProfileKind) is called. For all three profiles, this is `TestRunner.runHandler`.

The `runHandler` does the following:

- Creates a [TestRun](https://code.visualstudio.com/api/references/vscode-api#TestRun) from the [TestRunRequest](https://code.visualstudio.com/api/references/vscode-api#TestRunRequest) passed in as a parameter
- If the profile in the request is a `Debug` profile, it starts a debugging session and continues
- Marks all the [TestItems](https://code.visualstudio.com/api/references/vscode-api#TestItem) in the request as enqueued.
- Builds the command to run the requested tests (obtained from the `RspecConfig`/`MinitestConfig` classes, as appropriate)
  - If the profile in the request is the `ResolveTests` profile, it builds a dry-run (RSpec)/list tests (Minitest) command
- Creates a `FrameworkProcess` instance, passing in the command to be run
  - `FrameworkProcess` is a wrapper around the `child_process` in which the test framework runs. It parses the output, and emits status events based on it, and handles the lifetime of the child process, terminating it early if needed.
- Registers a `TestStatusListener` with the `FrameworkProcess` to call the [TestRun](https://code.visualstudio.com/api/references/vscode-api#TestRun) with information about the test results as they are received.
- Tells the `FrameworkProcess` instance to spawn the child process and waits for it to finish
- Calls `end` on the [TestRun](https://code.visualstudio.com/api/references/vscode-api#TestRun) to let VSCode know the test run is finished.
