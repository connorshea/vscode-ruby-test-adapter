import * as vscode from 'vscode'

export class StubTestItemCollection implements vscode.TestItemCollection {
  private testIds: { [name: string]: number } = {};
  private data: vscode.TestItem[] = []
  size: number = 0;

  replace(items: readonly vscode.TestItem[]): void {
    this.data = []
    items.forEach(item => {
      this.testIds[item.id] = this.data.length
      this.data.push(item)
    })
    this.size = this.data.length;
  }

  forEach(callback: (item: vscode.TestItem, collection: vscode.TestItemCollection) => unknown, thisArg?: unknown): void {
    this.data.forEach((element: vscode.TestItem) => {
      return callback(element, this)
    });
  }

  add(item: vscode.TestItem): void {
    this.testIds[item.id] = this.data.length
    this.data.push(item)
    this.size++
  }

  delete(itemId: string): void {
    let index = this.testIds[itemId]
    if (index !== undefined || -1) {
      this.data.splice(index)
      delete this.testIds[itemId]
      this.size--
    }
  }

  get(itemId: string): vscode.TestItem | undefined {
    let item: vscode.TestItem | undefined = undefined
    this.data.forEach((child) => {
      if (!item) {
        if (child.id === itemId) {
          item = child
        } else {
          let result = child.children.get(itemId)
          if (result) {
            item = result
          }
        }
      }
    })
    return item
  }
}