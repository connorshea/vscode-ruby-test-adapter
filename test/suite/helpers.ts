import * as vscode from 'vscode'
import { expect } from 'chai'
import { IVSCodeExtLogger, IChildLogger } from "@vscode-logging/types";
import { StubTestItemCollection } from '../stubs/stubTestItemCollection';
import { anyString, anything, instance, mock, when } from 'ts-mockito';

export function noop() {}

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

function writeStdOutLogMsg(level: string, msg: string, ...args: any[]): void {
  console.log(`[${level}] ${msg}${args.length > 0 ? ':' : ''}`)
  args.forEach((arg) => {
    console.log(`${JSON.stringify(arg)}`)
  })
  console.log('----------')
}

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

const STDOUT_LOGGER: IVSCodeExtLogger = {
  changeLevel: noop,
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
Object.freeze(STDOUT_LOGGER)

export function noop_logger(): IVSCodeExtLogger { return NOOP_LOGGER }
export function stdout_logger(): IVSCodeExtLogger { return STDOUT_LOGGER }

/**
 * Object to simplify describing a {@link vscode.TestItem TestItem} for testing its values
 */
export type TestItemExpectation = {
  id: string,
  file: string,
  label: string,
  line?: number,
  children?: TestItemExpectation[]
}

/**
 * Assert that a {@link vscode.TestItem TestItem} matches the expected values
 * @param testItem {@link vscode.TestItem TestItem} to check
 * @param expectation {@link TestItemExpectation} to check against
 */
export function testItemMatches(testItem: vscode.TestItem, expectation: TestItemExpectation | undefined) {
  if (!expectation) expect.fail("No expectation given")

  expect(testItem.id).to.eq(expectation.id, `id mismatch (expected: ${expectation.id})`)
  expect(testItem.uri).to.not.be.undefined
  expect(testItem.uri?.path).to.eql(expectation.file, `uri mismatch (id: ${expectation.id})`)
  if (expectation.children && expectation.children.length > 0) {
    expect(testItem.children.size).to.eq(expectation.children.length, `wrong number of children (id: ${expectation.id})`)
    let i = 0;
    testItem.children.forEach((child) => {
      testItemMatches(child, expectation.children![i])
      i++
    })
  }
  expect(testItem.canResolveChildren).to.be.false
  expect(testItem.label).to.eq(expectation.label, `label mismatch (id: ${expectation.id})`)
  expect(testItem.description).to.be.undefined
  //expect(testItem.description).to.eq(expectation.label, 'description mismatch')
  if (expectation.line) {
    expect(testItem.range).to.not.be.undefined
    expect(testItem.range?.start.line).to.eq(expectation.line, `line number mismatch (id: ${expectation.id})`)
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
  testItems.forEach((testItem: vscode.TestItem, i: number) => {
    testItemMatches(testItem, expectation[i])
  })
}

/**
 * Loops through an array of {@link vscode.TestItem TestItem}s and asserts whether each in turn matches the expectation with the same index
 * @param testItems TestItems to check
 * @param expectation Array of {@link TestItemExpectation}s to compare to
 */
 export function testItemCollectionMatches(testItems: vscode.TestItemCollection, expectation: TestItemExpectation[]) {
  expect(testItems.size).to.eq(expectation.length)
  let i = 0;
  testItems.forEach((testItem: vscode.TestItem) => {
    testItemMatches(testItem, expectation[i])
    i++
  })
}

export function setupMockTestController(): vscode.TestController {
  let mockTestController = mock<vscode.TestController>()
  let createTestItem = (id: string, label: string, uri: vscode.Uri | undefined) => {
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
      children: new StubTestItemCollection(),
    }
  }
  when(mockTestController.createTestItem(anyString(), anyString(), anything())).thenCall(createTestItem)
  let testItems = new StubTestItemCollection()
  when(mockTestController.items).thenReturn(testItems)
  return mockTestController
}

export function setupMockRequest(testController: vscode.TestController, testId: string): vscode.TestRunRequest {
  let mockRequest = mock<vscode.TestRunRequest>()
  let testItem = testController.items.get(testId)
  if (testItem === undefined) {
    throw new Error("Couldn't find test")
  }
  when(mockRequest.include).thenReturn([testItem])
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