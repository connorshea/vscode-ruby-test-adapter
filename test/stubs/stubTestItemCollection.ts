import { IChildLogger } from '@vscode-logging/logger';
import * as vscode from 'vscode'
import { StubTestItem } from './stubTestItem';

export class StubTestItemCollection implements vscode.TestItemCollection {
  private testIds: { [name: string]: vscode.TestItem } = {};
  get size(): number { return Object.keys(this.testIds).length; };
  private readonly log: IChildLogger
  private readonly parentItem?: vscode.TestItem;

  constructor(readonly rootLog: IChildLogger, controller: vscode.TestController, parent?: vscode.TestItem) {
    this.log = rootLog.getChildLogger({label: `StubTestItemCollection(${parent?.id || 'controller'})`})
    this.parentItem = parent
  }

  replace(items: readonly vscode.TestItem[]): void {
    //this.log.debug(`Replacing all tests`, JSON.stringify(Object.keys(this.testIds)), JSON.stringify(items.map(x => x.id)))
    this.testIds = {}
    items.forEach(item => {
      this.testIds[item.id] = item
    })
  }

  forEach(callback: (item: vscode.TestItem, collection: vscode.TestItemCollection) => unknown, thisArg?: unknown): void {
    Object.values(this.testIds).forEach((element: vscode.TestItem) => {
      return callback(element, this)
    });
  }

  [Symbol.iterator](): Iterator<[id: string, testItem: vscode.TestItem]> {
    let step = 0;
    const iterator = {
      next(): IteratorResult<[id: string, testItem: vscode.TestItem]> {
        let testId = Object.keys(super.testIds)[step];
        let value: [id: string, testItem: vscode.TestItem] = [
          testId,
          super.testIds[testId]
        ];
        step++;
        return {
          value: value,
          done: step >= super.size
        }
      }
    }
    return iterator;
  }

  add(item: vscode.TestItem): void {
    this.log.debug(`Adding test ${item.id} to ${JSON.stringify(Object.keys(this.testIds))}`)
    this.testIds[item.id] = item
    let sortedIds = Object.values(this.testIds).sort((a, b) => {
      if(a.id > b.id) return 1
      if(a.id < b.id) return -1
      return 0
    })
    this.testIds = {}
    sortedIds.forEach(item => this.testIds[item.id] = item)
    if (this.parentItem) {
      (item as StubTestItem).parent = this.parentItem
    }
  }

  delete(itemId: string): void {
    this.log.debug(`Deleting test ${itemId} from ${JSON.stringify(Object.keys(this.testIds))}`)
    delete this.testIds[itemId]
  }

  get(itemId: string): vscode.TestItem | undefined {
    return this.testIds[itemId]
  }

  toString(): string {
    var output = []
    output.push("[")
    this.forEach((item, _) => { output.push(item.id, ", ") })
    if (this.size > 0) output = output.slice(0, -1)
    output.push("]")
    return output.join("")
  }
}
