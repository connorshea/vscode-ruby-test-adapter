import * as vscode from 'vscode'
import { expect } from 'chai'
import { IVSCodeExtLogger, IChildLogger, LogLevel } from "@vscode-logging/types";
import { anyString, anything, capture, instance, mock, when } from 'ts-mockito';
import { ArgCaptor1, ArgCaptor2, ArgCaptor3 } from 'ts-mockito/lib/capture/ArgCaptor';

import { StubTestItemCollection } from '../stubs/stubTestItemCollection';
import { TestSuite } from '../../src/testSuite';

export function noop() {}

/**
 * Noop logger for use in testing where logs are usually unnecessary
 */
const NOOP_LOGGER: IVSCodeExtLogger = {
  changeLevel: noop,
  changeSourceLocationTracking: noop,
  debug: noop,
  error: noop,
  fatal: noop,
  getChildLogger(opts: { label: string }): IChildLogger {
    return this;
  },
  info: noop,
  trace: noop,
  warn: noop
}
Object.freeze(NOOP_LOGGER)

function createChildLogger(parent: IVSCodeExtLogger, label: string): IChildLogger {
  let prependLabel = (l:string, m:string):string => `${l}: ${m}`
  return {
    ...parent,
    debug: (msg: string, ...args: any[]) => { parent.debug(prependLabel(label, msg), ...args) },
    error: (msg: string, ...args: any[]) => { parent.error(prependLabel(label, msg), ...args) },
    fatal: (msg: string, ...args: any[]) => { parent.fatal(prependLabel(label, msg), ...args) },
    info: (msg: string, ...args: any[]) => { parent.info(prependLabel(label, msg), ...args) },
    trace: (msg: string, ...args: any[]) => { parent.trace(prependLabel(label, msg), ...args) },
    warn: (msg: string, ...args: any[]) => { parent.warn(prependLabel(label, msg), ...args) }
  }
}

/**
 * Get a noop logger for use in testing where logs are usually unnecessary
 */
export function noop_logger(): IVSCodeExtLogger { return NOOP_LOGGER }

/**
 * Get a logger that logs to stdout.
 *
 * Not terribly pretty but useful for seeing what failing tests are doing
 */
export function stdout_logger(level: LogLevel = "info"): IVSCodeExtLogger {
  const levels: { [key: string]: number } = {
    "fatal": 0,
    "error": 1,
    "warn": 2,
    "info": 3,
    "debug": 4,
    "trace": 5,
  }
  const divider = '----------'
  let maxLevel = levels[level]
  function writeStdOutLogMsg(level: LogLevel, msg: string, ...args: any[]): void {
    if (levels[level] <= maxLevel) {
      let message = `[${level}] ${msg}${args.length > 0 ? ':' : ''}`
      args.forEach((arg) => {
        if (arg instanceof Error) {
          message = `${message}\n  ${arg.stack ? arg.stack : arg.name + ': ' + arg.message}`
        } else {
          message = `${message}\n  ${JSON.stringify(arg)}`
        }
      })
      switch(level) {
        case "fatal":
        case "error":
          console.error(message)
          console.error(divider)
          break;
        case "warn":
          console.warn(message)
          console.warn(divider)
          break;
        case "info":
          console.info(message)
          console.info(divider)
          break;
        case "debug":
        case "trace":
          console.debug(message)
          console.debug(divider)
          break;
      }
    }
  }
  let logger: IVSCodeExtLogger = {
    changeLevel: (level: LogLevel) => { maxLevel = levels[level] },
    changeSourceLocationTracking: noop,
    debug: (msg: string, ...args: any[]) => { writeStdOutLogMsg("debug", msg, ...args) },
    error: (msg: string, ...args: any[]) => { writeStdOutLogMsg("error", msg, ...args) },
    fatal: (msg: string, ...args: any[]) => { writeStdOutLogMsg("fatal", msg, ...args) },
    getChildLogger(opts: { label: string }): IChildLogger {
      return createChildLogger(this, opts.label);
    },
    info: (msg: string, ...args: any[]) => { writeStdOutLogMsg("info", msg, ...args) },
    trace: (msg: string, ...args: any[]) => { writeStdOutLogMsg("trace", msg, ...args) },
    warn: (msg: string, ...args: any[]) => { writeStdOutLogMsg("warn", msg, ...args) }
  }
  return logger
}

/**
 * Object to simplify describing a {@link vscode.TestItem TestItem} for testing its values
 */
export type TestItemExpectation = {
  id: string,
  label: string,
  file?: string,
  line?: number,
  children?: TestItemExpectation[],
  canResolveChildren?: boolean,
}

/**
 * Object to simplify describing a {@link vscode.TestItem TestItem} for testing its values
 */
export type TestFailureExpectation = {
  message?: string,
  actualOutput?: string,
  expectedOutput?: string,
  line?: number,
}

export function testUriMatches(testItem: vscode.TestItem, path?: string) {
  if (path) {
    expect(testItem.uri).to.not.be.undefined
    expect(testItem.uri?.path).to.eql(path, `uri mismatch (id: ${testItem.id})`)
  } else {
    expect(testItem.uri).to.be.undefined
  }
}

/**
 * Assert that a {@link vscode.TestItem TestItem} matches the expected values
 * @param testItem {@link vscode.TestItem TestItem} to check
 * @param expectation {@link TestItemExpectation} to check against
 */
export function testItemMatches(testItem: vscode.TestItem, expectation?: TestItemExpectation, message?: string) {
  if (!expectation) expect.fail("No expectation given")

  expect(testItem.id).to.eq(expectation.id, `${message ? message + ' - ' : ''}id mismatch (expected: ${expectation.id})`)
  testUriMatches(testItem, expectation.file)
  if (expectation.children && expectation.children.length > 0) {
    testItemCollectionMatches(testItem.children, expectation.children, testItem)
  }
  expect(testItem.canResolveChildren).to.eq(expectation.canResolveChildren || false, `${message ? message + ' - ' : ''}canResolveChildren (id: ${expectation.id})`)
  expect(testItem.label).to.eq(expectation.label, `${message ? message + ' - ' : ''}label mismatch (id: ${expectation.id})`)
  expect(testItem.description).to.be.undefined
  //expect(testItem.description).to.eq(expectation.label, 'description mismatch')
  if (expectation.line) {
    expect(testItem.range).to.not.be.undefined
    expect(testItem.range?.start.line).to.eq(expectation.line, `${message ? message + ' - ' : ''}line number mismatch (id: ${expectation.id})`)
  } else {
    expect(testItem.range).to.be.undefined
  }
  expect(testItem.error).to.be.undefined
}

/**
 * Loops through an array of {@link vscode.TestItem TestItem}s and asserts whether each in turn matches the expectation with the same index
 * @param testItems TestItems to check
 * @param expectation Array of {@link TestItemExpectation}s to compare to
 */
export function testItemArrayMatches(testItems: readonly vscode.TestItem[], expectation: TestItemExpectation[]) {
  expect(testItems.length).to.eq(expectation.length)
  testItems.forEach((testItem: vscode.TestItem, i: number) => {
    testItemMatches(testItem, expectation[i])
  })
}

/**
 * Loops through a {@link vscode.TestItemCollection TestItemCollection} and asserts whether each in turn matches the expectation with the same index
 * @param testItems TestItems to check
 * @param expectation Array of {@link TestItemExpectation}s to compare to
 */
export function testItemCollectionMatches(
  testItems: vscode.TestItemCollection,
  expectation: TestItemExpectation[],
  parent?: vscode.TestItem
) {
  expect(testItems.size).to.eq(
    expectation.length,
    parent ? `Wrong number of children in item ${parent.id}\n\t${testItems.toString()}` : `Wrong number of items in collection\n\t${testItems.toString()}`
  )
  testItems.forEach((testItem: vscode.TestItem) => {
    let expectedItem = expectation.find(x => x.id == testItem.id)
    if(!expectedItem) {
      expect.fail(`${testItem.id} not found in expected items`)
    }
    testItemMatches(testItem, expectedItem)
  })
}

export function verifyFailure(
  index: number,
  captor: ArgCaptor3<vscode.TestItem, vscode.TestMessage, number | undefined>,
  expectedTestItem: TestItemExpectation,
  expectation: TestFailureExpectation,
  message?: string): void
{
  let failure = captor.byCallIndex(index)
  let testItem = failure[0]
  let failureDetails = failure[1]
  let messagePrefix = message ? `${message} - ${testItem.id}` : testItem.id
  testItemMatches(testItem, expectedTestItem)
  if (expectation.message) {
    expect(failureDetails.message).to.contain(expectation.message, `${messagePrefix}: message`)
  } else {
    expect(failureDetails.message).to.eq('')
  }
  expect(failureDetails.actualOutput).to.eq(expectation.actualOutput, `${messagePrefix}: actualOutput`)
  expect(failureDetails.expectedOutput).to.eq(expectation.expectedOutput, `${messagePrefix}: expectedOutput`)
  expect(failureDetails.location?.range.start.line).to.eq(expectation.line || 0, `${messagePrefix}: line number`)
  expect(failureDetails.location?.uri.fsPath).to.eq(expectedTestItem.file, `${messagePrefix}: path`)
}

export function setupMockTestController(rootLog?: IChildLogger): vscode.TestController {
  let mockTestController = mock<vscode.TestController>()
  let createTestItem = (id: string, label: string, uri?: vscode.Uri | undefined) => {
    return {
      id: id,
      label: label,
      uri: uri,
      canResolveChildren: false,
      parent: undefined,
      tags: [],
      busy: false,
      range: undefined,
      error: undefined,
      children: new StubTestItemCollection(rootLog || noop_logger(), instance(mockTestController)),
    }
  }
  when(mockTestController.createTestItem(anyString(), anyString())).thenCall(createTestItem)
  when(mockTestController.createTestItem(anyString(), anyString(), anything())).thenCall(createTestItem)
  let testItems = new StubTestItemCollection(rootLog || noop_logger(), instance(mockTestController))
  when(mockTestController.items).thenReturn(testItems)
  return mockTestController
}

export function setupMockRequest(testSuite: TestSuite, testId?: string | string[]): vscode.TestRunRequest {
  let mockRequest = mock<vscode.TestRunRequest>()
  if (testId) {
    if (Array.isArray(testId)) {
      let testItems: vscode.TestItem[] = []
      testId.forEach(id => {
        let testItem = testSuite.getOrCreateTestItem(id)
        testItems.push(testItem)
      })
      when(mockRequest.include).thenReturn(testItems)
    } else {
      let testItem = testSuite.getOrCreateTestItem(testId as string)
      when(mockRequest.include).thenReturn([testItem])
    }
  } else {
    when(mockRequest.include).thenReturn(undefined)
  }
  when(mockRequest.exclude).thenReturn([])
  return mockRequest
}

export function getMockCancellationToken(): vscode.CancellationToken {
  let mockToken = mock<vscode.CancellationToken>()
  when(mockToken.isCancellationRequested).thenReturn(false)
  when(mockToken.onCancellationRequested(anything(), anything(), undefined)).thenReturn({ dispose: () => {} })
  when(mockToken.onCancellationRequested(anything(), anything(), anything())).thenReturn({ dispose: () => {} })
  return instance(mockToken)
}

/**
 * Argument captors for test state reporting functions
 *
 * @param mockTestRun mock/spy of the vscode.TestRun used to report test states
 * @returns A map of argument captors for test state reporting functions
 */
export function testStateCaptors(mockTestRun: vscode.TestRun) {
  let invocationArgs1 = (args: ArgCaptor1<vscode.TestItem>, index: number): vscode.TestItem => args.byCallIndex(index)[0]
  let invocationArgs2 = (args: ArgCaptor2<vscode.TestItem, number | undefined>, index: number): { testItem: vscode.TestItem, duration: number | undefined } => { let abci = args.byCallIndex(index); return {testItem: abci[0], duration: abci[1]}}
  let invocationArgs3 = (args: ArgCaptor3<vscode.TestItem, vscode.TestMessage, number | undefined>, index: number): { testItem: vscode.TestItem, message: vscode.TestMessage, duration: number | undefined } => { let abci = args.byCallIndex(index); return {testItem: abci[0], message: abci[1], duration: abci[2]}}
  let captors = {
    enqueuedArgs: capture<vscode.TestItem>(mockTestRun.enqueued),
    erroredArgs: capture<vscode.TestItem, vscode.TestMessage, number | undefined>(mockTestRun.errored),
    failedArgs: capture<vscode.TestItem, vscode.TestMessage, number | undefined>(mockTestRun.failed),
    passedArgs: capture<vscode.TestItem, number | undefined>(mockTestRun.passed),
    startedArgs: capture<vscode.TestItem>(mockTestRun.started),
    skippedArgs: capture<vscode.TestItem>(mockTestRun.skipped)
  }
  return {
    ...captors,
    enqueuedArg: (index: number) => invocationArgs1(captors.enqueuedArgs, index),
    erroredArg: (index: number) => invocationArgs3(captors.erroredArgs, index),
    failedArg: (index: number) => invocationArgs3(captors.failedArgs, index),
    passedArg: (index: number) => invocationArgs2(captors.passedArgs, index),
    startedArg: (index: number) => invocationArgs1(captors.startedArgs, index),
    skippedArg: (index: number) => invocationArgs1(captors.skippedArgs, index),
  }
}
