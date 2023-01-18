import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { IChildLogger } from '@vscode-logging/logger';
import { __asyncDelegator } from 'tslib';
import { TestStatusListener } from './testStatusListener';
import { TestSuiteManager } from './testSuiteManager';
import { FrameworkProcess } from './frameworkProcess';

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
    this.log.debug("Dispose called")
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

    if (!request.profile) {
      log.error('Test run request is missing a profile', {request: request})
      return
    }

    // Loop through all included tests, or all known tests, and add them to our queue
    log.debug('Number of tests in request', request.include?.length || 0);

    log.info('Creating test run', {request: request});
    const testRun = this.manager.controller.createTestRun(request)

    try {
      log.trace("Included tests in request", request.include?.map(x => x.id));
      log.trace("Excluded tests in request", request.exclude?.map(x => x.id));
      let testsToRun = request.exclude ? request.include?.filter(x => !request.exclude!.includes(x)) : request.include
      log.trace("Running tests", testsToRun?.map(x => x.id));

      if (request.profile.label === 'ResolveTests') {
        // Load tests
        await this.runTestFramework(
          {
            command: this.manager.config.getResolveTestsCommand(),
            args: this.manager.config.getTestArguments(testsToRun),
          },
          testRun,
          request.profile
        )
      } else {
        // Run tests
        if (!testsToRun) {
          log.debug("Running all tests")
          this.manager.controller.items.forEach((item) => {
            // Mark selected tests as started
            this.enqueTestAndChildren(item, testRun)
          })
        } else {
          log.debug("Running selected tests")
          // Mark selected tests as started
          testsToRun.forEach(item => this.enqueTestAndChildren(item, testRun))
        }
        let command = {
          command: this.manager.config.getRunTestsCommand(debuggerConfig),
          args: this.manager.config.getTestArguments(testsToRun)
        }
        if (debuggerConfig) {
          log.debug('Debugging tests', request.include?.map(x => x.id));
          await Promise.all([
            this.startDebugSession(debuggerConfig, request.profile),
            this.runTestFramework(command, testRun, request.profile)
          ])
        }
        else {
          log.debug('Running test', request.include?.map(x => x.id));
          await this.runTestFramework(command, testRun, request.profile)
        }
      }
    }
    catch (err) {
      log.error("Error running tests", err)
    }
    finally {
      // Make sure to end the run after all tests have been executed:
      log.debug('Ending test run');
      testRun.end();
    }
    if (token.isCancellationRequested) {
      log.info('Test run aborted due to cancellation - token passed into runHandler')
    } else if (testRun.token.isCancellationRequested) {
      log.info('Test run aborted due to cancellation - token from controller via TestRun')
    }
  }

  private async startDebugSession(debuggerConfig: vscode.DebugConfiguration, profile: vscode.TestRunProfile): Promise<void> {
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
          this.killTestRun(profile) // terminate the test run
          debugStopSubscription.dispose();
        }
      })
    } catch (err) {
      log.error('Error starting debug session', err)
      this.killTestRun(profile)
    }
  }

  /**
   * Mark a test node and all its children as being queued for execution
   */
  private enqueTestAndChildren(test: vscode.TestItem, testRun: vscode.TestRun) {
    // Tests will be marked as started as the runner gets to them
    let log = this.log.getChildLogger({label: `${this.enqueTestAndChildren.name}`})
    log.debug('Enqueueing test item: %s', test.id)
    testRun.enqueued(test);
    if (test.children && test.children.size > 0) {
      test.children.forEach(child => { this.enqueTestAndChildren(child, testRun) })
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
  private async runTestFramework (testCommand: { command: string, args: string[] }, testRun: vscode.TestRun, profile: vscode.TestRunProfile): Promise<void> {
    const spawnArgs: childProcess.SpawnOptions = {
      cwd: this.workspace?.uri.fsPath,
      shell: true,
      env: this.manager.config.getProcessEnv()
    };

    this.log.info('Running command: %s', testCommand);
    let testProfileKind = profile.kind

    if (this.testProcessMap.get(testProfileKind)) {
      this.log.warn('Test run already in progress for profile kind: %s', testProfileKind)
      return
    }
    let testProcess = new FrameworkProcess(this.log, testCommand.command, spawnArgs, testRun.token, this.manager)
    this.disposables.push(testProcess)
    this.testProcessMap.set(testProfileKind, testProcess);

    const statusListener = TestStatusListener.listen(
      this.rootLog,
      profile,
      testRun,
      testProcess.testStatusEmitter
    )
    this.disposables.push(statusListener)
    try {
      await testProcess.startProcess(testCommand.args, this.debugCommandStartedResolver)
    } finally {
      this.disposeInstance(statusListener)
      this.disposeInstance(testProcess)
      this.testProcessMap.delete(testProfileKind)
    }
  }

  /**
   * Terminates the current test run process for the given profile kind if there is one
   * @param profile The profile to kill the test run for
   */
  private killTestRun(profile: vscode.TestRunProfile) {
    let profileKind = profile.kind
    let process = this.testProcessMap.get(profileKind)
    if (process) {
      this.disposeInstance(process)
      this.testProcessMap.delete(profileKind)
    }
  }
}
