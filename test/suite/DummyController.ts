import { TestAdapter, TestController, TestEvent, TestSuiteInfo } from "vscode-test-adapter-api";

export const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

export class DummyController implements TestController {
  adapter: TestAdapter | undefined
  suite: TestSuiteInfo | undefined
  testEvents: { [testRunId: string]: TestEvent[] }

  constructor() {
    this.testEvents = {}
  }

  async load() {
    await this.adapter?.load()
  }

  async runTest(...testRunIds: string[]) {
    await this.adapter?.run(testRunIds)
  }

  registerTestAdapter(adapter: TestAdapter) {
    if (this.adapter === undefined) {
      this.adapter = adapter

      adapter.tests(event => {
        switch (event.type) {
        case 'started':
          this.suite = undefined
          this.testEvents = {}
          break
        case 'finished':
          this.suite = event.suite
          break
        }
      })

      adapter.testStates(event => {
        switch (event.type) {
        case 'test':
          const id = event.test
          if (typeof id === "string") {
            const value = this.testEvents[id]
            if (!Array.isArray(value)) {
              this.testEvents[id] = [event]
            } else {
              value.push(event)
            }
          }
        }
      })
    }
  }

  unregisterTestAdapter(adapter: TestAdapter) {
    if (this.adapter === adapter) {
      this.adapter = undefined
    }
  }
}
