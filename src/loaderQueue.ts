import * as vscode from 'vscode';
import { IChildLogger } from '@vscode-logging/logger';

/**
 * Type for items in the ResolveQueue
 * item: The TestItem that is enqueued
 * resolve: Function to call once this item has been loaded to resolve the associated promise
 * reject: Function to call if there is an error loading this test (or the batch it is part of), to reject the associated promise
 */
export type QueueItem = {
  item: vscode.TestItem,
  resolve: () => void,
  reject: (reason?: any) => void
}

/**
 * Queue for tests to be resolved/loaded
 *
 * When there are many files changed at once (e.g. during git checkouts/pulls, or when first loading all files in a
 * project), we need to make sure that we don't spawn hundreds of test runners at once as that'll grind the computer
 * to a halt. We can't change that fact that the async file resolvers notify us about files individually, so we use
 * this queue to batch them up.
 *
 * When a test item is enqueued, the async worker function is woken up, drains the queue and runs all the enqueued
 * items in a batch. While it is running, any additional items that are enqueued will sit in the queue. When the
 * worker function finishes a batch, it will drain the queue again if there are items in it and run another batch,
 * and if not it will wait until more items have been enqueued
 */
export class LoaderQueue implements vscode.Disposable {
  private readonly log: IChildLogger
  private readonly queue: Set<QueueItem> = new Set<QueueItem>()
  private isDisposed = false
  private notifyQueueWorker?: () => void
  private terminateQueueWorker?: () => void
  public readonly worker: Promise<void>

  constructor(rootLog: IChildLogger, private readonly processItems: (testItems?: vscode.TestItem[]) => Promise<void>) {
    this.log = rootLog.getChildLogger({label: 'ResolveQueue'})
    this.worker = this.resolveItemsInQueueWorker()
  }

  /**
   * Notifies the worker function that the queue is being disposed, so that it knows to stop processing items
   * from the queue and that it must terminate, then waits for the worker function to finish
   */
  dispose() {
    // TODO: Terminate child process
    this.log.info('disposed')
    this.isDisposed = true
    if (this.terminateQueueWorker) {
      // Stop the worker function from waiting for more items
      this.log.debug('notifying worker for disposal')
      this.terminateQueueWorker()
    }
    // Wait for worker to finish
    this.log.debug('waiting for worker to finish')
    this.worker
      .then(() => {this.log.info('worker promise resolved')})
      .catch((err) => {this.log.error('Error in worker', err)})
  }

  /**
   * Enqueues a test item to be loaded
   *
   * @param item Test item to be loaded
   * @returns A promise that is resolved once the test item has been loaded, or which is rejected if there is
   *   an error while loading the item (or the batch containing the item)
   */
  public enqueue(item: vscode.TestItem): Promise<vscode.TestItem> {
    this.log.debug('enqueing item to resolve', item.id)
    // Create queue item with empty functions
    let queueItem: QueueItem = {
      item: item,
      resolve: () => {},
      reject: () => {},
    }
    let itemPromise = new Promise<vscode.TestItem>((resolve, reject) => {
      // Set the resolve & reject functions in the queue item to resolve/reject this promise
      queueItem["resolve"] = () => resolve(item)
      queueItem["reject"] = reject
    })
    this.queue.add(queueItem)
    if (this.notifyQueueWorker) {
      this.log.debug('notifying worker of items in queue')
      // Notify the worker function that there are items to resolve if it's waiting
      this.notifyQueueWorker()
    }
    return itemPromise
  }

  private async resolveItemsInQueueWorker(): Promise<void> {
    let log = this.log.getChildLogger({label: 'WorkerFunction'})
    log.info('worker started')
    // Check to see if the queue is being disposed
    while(!this.isDisposed) {
      if (this.queue.size == 0) {
        log.debug('awaiting items to resolve')
        // While the queue is empty, wait for more items
        await new Promise<void>((resolve, reject) => {
          // Set notification functions to the resolve/reject functions of this promise
          this.notifyQueueWorker = async () => {
            log.debug('received notification of items in queue')
            resolve()
          }
          this.terminateQueueWorker = (reason?: any) => {
            log.error('received rejection while waiting for items to be enqueued', reason)
            reject(reason)
          }
        })
        // Clear notification functions before draining queue and processing items
        this.notifyQueueWorker = undefined
        this.terminateQueueWorker = undefined
      } else {
        // Drain queue to get batch of test items to load
        let queueItems = Array.from(this.queue)
        this.queue.clear()

        let items = queueItems.map(x => x["item"])
        this.log.debug('worker resolving items', items.map(x => x.id))
        try {
          // Load tests for items in queue
          await this.processItems(items)
          // Resolve promises associated with items in queue that have now been loaded
          queueItems.map(x => x["resolve"]())
        } catch (err) {
          this.log.error("Error resolving tests from queue", err)
          // Reject promises associated with items in queue that we were trying to load
          queueItems.map(x => x["reject"](err))
        }
      }
    }
    this.log.debug('worker finished')
  }
}
