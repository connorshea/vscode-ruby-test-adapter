import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { IChildLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';
import { TestRunContext } from './testRunContext';
import { TestSuiteManager } from './testSuiteManager';
import { FrameworkProcess } from './frameworkProcess';
import { Status, TestStatus } from './testStatus';

export class TestRunner implements vscode.Disposable {
  protected debugCommandStartedResolver?: () => void;
  protected disposables: { dispose(): void }[] = [];
  protected readonly log: IChildLogger;
  private readonly testProcessMap: Map<vscode.TestRunProfileKind, FrameworkProcess>

  /**
   * @param rootLog The Test Adapter logger, for logging.
   * @param workspace Open workspace folder
   * @param manager TestSuiteManager instance
   */
  constructor(
    readonly rootLog: IChildLogger,
    protected manager: TestSuiteManager,
    protected workspace?: vscode.WorkspaceFolder,
  ) {
    this.log = rootLog.getChildLogger({label: "TestRunner"})
    this.testProcessMap = new Map<vscode.TestRunProfileKind, FrameworkProcess>()
  }

  public dispose() {
    for (const disposable of this.disposables) {
      try {
        disposable.dispose();
      } catch (err) {
        this.log.error('Error disposing object', err)
      }
    }
    this.disposables = [];
  }

  /**
   * Helper method to dispose of an object and remove it from the list of disposables
   *
   * @param instance the object to be disposed
   */
  private disposeInstance(instance: vscode.Disposable) {
    let index = this.disposables.indexOf(instance);
    if (index !== -1) {
      this.disposables.splice(index)
    }
    else {
      this.log.debug("Factory instance not null but missing from disposables when configuration changed");
    }
    instance.dispose()
  }

  /**
   * Get the location of the test in the testing tree.
   *
   * Test ids are in the form of `/spec/model/game_spec.rb[1:1:1]`, and this
   * function turns that into `111`. The number is used to order the tests
   * in the explorer.
   *
   * @param test The test we want to get the location of.
   * @return A number representing the location of the test in the test tree.
   */
  protected getTestLocation(test: vscode.TestItem): number {
    return parseInt(test.id.substring(test.id.indexOf("[") + 1, test.id.lastIndexOf("]")).split(':').join(''));
  }

  // /**
  //  * Sorts an array of TestSuiteInfo objects by label.
  //  *
  //  * @param testSuiteChildren An array of TestSuiteInfo objects, generally the children of another TestSuiteInfo object.
  //  * @return The input array, sorted by label.
  //  */
  // protected sortTestSuiteChildren(testSuiteChildren: Array<TestSuiteInfo>): Array<TestSuiteInfo> {
  //   testSuiteChildren = testSuiteChildren.sort((a: TestSuiteInfo, b: TestSuiteInfo) => {
  //     let comparison = 0;
  //     if (a.label > b.label) {
  //       comparison = 1;
  //     } else if (a.label < b.label) {
  //       comparison = -1;
  //     }
  //     return comparison;
  //   });

  //   return testSuiteChildren;
  // }

  /**
   * Test run handler
   *
   * Called by VSC when a user requests a test run
   * @param request Request containing tests to be run and tests to be excluded from the run
   * @param token Cancellation token which will trigger when a user cancels a test run
   * @param debuggerConfig VSC Debugger configuration if a debug run was requested, or `null`
   */
  public async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    debuggerConfig?: vscode.DebugConfiguration
  ) {
    let log = this.log.getChildLogger({ label: 'runHandler' })

    // Loop through all included tests, or all known tests, and add them to our queue
    log.debug('Number of tests in request', request.include?.length || 0);
    let context = new TestRunContext(
      this.rootLog,
      token,
      request,
      this.manager.controller
    );

    try {
      log.trace("Included tests in request", request.include?.map(x => x.id));
      log.trace("Excluded tests in request", request.exclude?.map(x => x.id));
      let testsToRun = request.exclude ? request.include?.filter(x => !request.exclude!.includes(x)) : request.include
      log.trace("Running tests", testsToRun?.map(x => x.id));

      let command: string
      if (context.request.profile?.label === 'ResolveTests') {
        command = this.manager.config.getResolveTestsCommand(testsToRun)
        await this.runTestFramework(command, context)
      } else if (!testsToRun) {
        log.debug("Running all tests")
        this.manager.controller.items.forEach((item) => {
          // Mark selected tests as started
          this.enqueTestAndChildren(item, context)
        })
        command = this.manager.config.getFullTestSuiteCommand(context.debuggerConfig)
      } else {
        log.debug("Running selected tests")
        command = this.manager.config.getFullTestSuiteCommand(context.debuggerConfig)
        for (const node of testsToRun) {
          log.trace('Adding test to command: %s', node.id)
          // Mark selected tests as started
          this.enqueTestAndChildren(node, context)
          command = `${command} ${node.uri?.fsPath}`
          if (!node.canResolveChildren) {
            // single test
            if (!node.range) {
              throw new Error(`Test item is missing line number: ${node.id}`)
            }
            command = `${command}:${node.range!.start.line + 1}`
          }
          log.trace("Current command: %s", command)
        }
      }
      if (debuggerConfig) {
        log.debug('Debugging tests', request.include?.map(x => x.id));
        await Promise.all([this.startDebugSession(debuggerConfig, context), this.runTestFramework(command, context)])
      }
      else {
        log.debug('Running test', request.include?.map(x => x.id));
        await this.runTestFramework(command, context)
      }
    }
    catch (err) {
      log.error("Error running tests", err)
    }
    finally {
      // Make sure to end the run after all tests have been executed:
      log.debug('Ending test run');
      context.endTestRun();
    }
    if (token.isCancellationRequested) {
      log.info('Test run aborted due to cancellation')
    }
  }

  private async startDebugSession(debuggerConfig: vscode.DebugConfiguration, context: TestRunContext): Promise<void> {
    let log = this.log.getChildLogger({label: 'startDebugSession'})

    if (this.workspace) {
      log.error('Cannot debug without a folder opened')
      return
    }

    this.log.info('Starting the debug session');

    const debugCommandStartedPromise = new Promise<void>((resolve, _) => {
      this.debugCommandStartedResolver = () => resolve()
    })
    try {
      let activeDebugSession: vscode.DebugSession
      const debugStartSessionSubscription = vscode.debug.onDidStartDebugSession(debugSession => {
        if (debugSession.name === debuggerConfig.name) {
          log.info('Debug session started', debugSession.name);
          activeDebugSession = debugSession
        }
      })
      try {
        await Promise.race(
          [
            // Wait for either timeout or for the child process to notify us that it has started
            debugCommandStartedPromise,
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Debug session failed to start within 5 seconds')), 5000))
          ]
        )
      } finally {
        debugStartSessionSubscription.dispose()
      }

      const debugSessionStarted = await vscode.debug.startDebugging(this.workspace, debuggerConfig);
      if (!debugSessionStarted) {
        throw new Error('Debug session failed to start')
      }

      const debugStopSubscription = vscode.debug.onDidTerminateDebugSession(session => {
        if (session === activeDebugSession) {
          log.info('Debug session ended', session.name);
          this.killProfileTestRun(context) // terminate the test run
          debugStopSubscription.dispose();
        }
      })
    } catch (err) {
      log.error('Error starting debug session', err)
      this.killProfileTestRun(context)
    }
  }

  /**
   * Mark a test node and all its children as being queued for execution
   */
  private enqueTestAndChildren(test: vscode.TestItem, context: TestRunContext) {
    // Tests will be marked as started as the runner gets to them
    context.enqueued(test);
    if (test.children && test.children.size > 0) {
      test.children.forEach(child => { this.enqueTestAndChildren(child, context) })
    }
  }

  /**
   * Spawns a child process to run a command, that will be killed
   * if the cancellation token is triggered
   *
   * @param testCommand The command to run
   * @param context Test run context for the cancellation token
   * @returns Raw output from process
   */
  private async runTestFramework (testCommand: string, context: TestRunContext): Promise<void> {
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace?.uri.fsPath,
      shell: true,
      env: this.manager.config.getProcessEnv()
    };

    this.log.info('Running command: %s', testCommand);
    let testProfileKind = context.request.profile!.kind

    if (this.testProcessMap.get(testProfileKind)) {
      this.log.warn('Test run already in progress for profile kind: %s', testProfileKind)
      return
    }
    let testProcess = new FrameworkProcess(this.log, testCommand, spawnArgs, context, this.manager)
    this.disposables.push(testProcess)
    this.testProcessMap.set(testProfileKind, testProcess);

    testProcess.testStatusEmitter.event((event: TestStatus) => {
      let log = this.log.getChildLogger({label: 'testStatusListener'})
      switch(event.status) {
        case Status.skipped:
          log.debug('Received test skipped event: %s', event.testItem.id)
          context.skipped(event.testItem)
          break;
        case Status.passed:
          log.debug('Received test passed event: %s (duration: %d)', event.testItem.id, event.duration)
          context.passed(event.testItem, event.duration)
          break;
        case Status.errored:
          log.debug('Received test errored event: %s (duration: %d)', event.testItem.id, event.duration, event.message)
          context.errored(event.testItem, event.message!, event.duration)
          break;
        case Status.failed:
          log.debug('Received test failed event: %s (duration: %d)', event.testItem.id, event.duration, event.message)
          context.failed(event.testItem, event.message!, event.duration)
          break;
        case Status.running:
          log.debug('Received test started event: %s', event.testItem.id)
          context.started(event.testItem)
          break;
        default:
          log.warn('Unexpected status: %s', event.status)
      }
    })
    try {
      await testProcess.startProcess(this.debugCommandStartedResolver)
    } finally {
      this.testProcessMap.delete(testProfileKind)
    }
  }

  private killProfileTestRun(context: TestRunContext) {
    let profileKind = context.request.profile!.kind
    let process = this.testProcessMap.get(profileKind)
    if (process) {
      this.disposeInstance(process)
      this.testProcessMap.delete(profileKind)
    }
  }
}
