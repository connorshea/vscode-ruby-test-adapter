import * as vscode from 'vscode'

export class StubTestItemCollection implements vscode.TestItemCollection {
  private testIds: { [name: string]: vscode.TestItem } = {};
  get size(): number { return Object.keys(this.testIds).length; };

  replace(items: readonly vscode.TestItem[]): void {
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
    this.testIds[item.id] = item
  }

  delete(itemId: string): void {
    delete this.testIds[itemId]
  }

  get(itemId: string): vscode.TestItem | undefined {
    return this.testIds[itemId]
  }
}