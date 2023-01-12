import { expect } from 'chai';
import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'
import path from 'path'

import { Config } from '../../../src/config';
import { TestSuiteManager } from '../../../src/testSuiteManager';
import { StubTestController } from '../../stubs/stubTestController';
import { NOOP_LOGGER } from '../../stubs/logger';
import { testUriMatches } from '../helpers';

suite('TestSuite', function () {
  let mockConfig: Config = mock<Config>();
  const config: Config = instance(mockConfig)
  let controller: vscode.TestController;
  let manager: TestSuiteManager;

  before(function () {
    let relativeTestPath = 'path/to/spec'
    when(mockConfig.getRelativeTestDirectory()).thenReturn(relativeTestPath)
    when(mockConfig.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
  });

  beforeEach(function () {
    controller = new StubTestController(NOOP_LOGGER)
    manager = new TestSuiteManager(NOOP_LOGGER, controller, instance(mockConfig))
  });

  suite('#normaliseTestId()', function () {
    const parameters = [
      { arg: 'test-id',                         expected: 'test-id' },
      { arg: './test-id',                       expected: 'test-id' },
      { arg: 'folder/test-id',                  expected: 'folder/test-id' },
      { arg: './folder/test-id',                expected: 'folder/test-id' },
      { arg: 'path/to/spec/test-id',            expected: 'test-id' },
      { arg: './path/to/spec/test-id',          expected: 'test-id' },
      { arg: 'path/to/spec/folder/test-id',     expected: 'folder/test-id' },
      { arg: './path/to/spec/folder/test-id',   expected: 'folder/test-id' },
      { arg: './path/to/spec/abs_spec.rb[1:1]', expected: 'abs_spec.rb[1:1]' },
      { arg: './path/to/spec/abs_spec.rb[1]',   expected: 'abs_spec.rb[1]' },
    ];

    parameters.forEach(({ arg, expected }) => {
      test(`correctly normalises ${arg} to ${expected}`, function () {
        expect(manager.normaliseTestId(arg)).to.eq(expected);
      });
    });
  });

  suite('#deleteTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'

    beforeEach(function () {
      controller.items.add(controller.createTestItem(id, label))
    })

    test('deletes only the specified test item', function () {
      let secondTestItem = controller.createTestItem('test-id-2', 'test-label-2')
      controller.items.add(secondTestItem)
      expect(controller.items.size).to.eq(2)

      manager.deleteTestItem(id)

      expect(controller.items.size).to.eq(1)
      expect(controller.items.get('test-id-2')).to.eq(secondTestItem)
    })

    test('does nothing if ID not found', function () {
      expect(controller.items.size).to.eq(1)

      manager.deleteTestItem('test-id-2')

      expect(controller.items.size).to.eq(1)
    })
  });

  suite('#getTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'
    const childId = 'folder/child-test'
    let testItem: vscode.TestItem
    let childItem: vscode.TestItem
    let folderItem: vscode.TestItem

    before(function () {
      testItem = controller.createTestItem(id, label)
      childItem = controller.createTestItem(childId, 'child-test')
      folderItem = controller.createTestItem('folder', 'folder')
    })

    beforeEach(function () {
      controller.items.add(testItem)
      folderItem.children.add(childItem)
      controller.items.add(folderItem)
    })

    test('gets the specified test if ID is found', function () {
      expect(manager.getTestItem(id)).to.eq(testItem)
    })

    test('returns undefined if ID is not found', function () {
      expect(manager.getTestItem('not-found')).to.be.undefined
    })

    test('gets the specified nested test if ID is found', function () {
      expect(manager.getTestItem(childId)).to.eq(childItem)
    })

    test('returns undefined if nested ID is not found', function () {
      expect(manager.getTestItem('folder/not-found')).to.be.undefined
    })

    test('returns undefined if parent of nested ID is not found', function () {
      expect(manager.getTestItem('not-found/child-test')).to.be.undefined
    })
  })

  suite('#getOrCreateTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'
    const childId = `folder${path.sep}child-test`
    let testItem: vscode.TestItem
    let childItem: vscode.TestItem

    beforeEach(function () {
      testItem = controller.createTestItem(id, label)
      childItem = controller.createTestItem(childId, 'child-test')
    })

    test('gets the specified item if ID is found', function () {
      controller.items.add(testItem)
      expect(manager.getOrCreateTestItem(id)).to.eq(testItem)
    })

    test('creates item if ID is not found', function () {
      let testItem = manager.getOrCreateTestItem('not-found')
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq('not-found')
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), 'not-found'))
    })

    test('gets the specified nested test if ID is found', function () {
      let folderItem = controller.createTestItem('folder', 'folder')
      controller.items.add(testItem)
      folderItem.children.add(childItem)
      controller.items.add(folderItem)

      expect(manager.getOrCreateTestItem(childId)).to.eq(childItem)
    })

    test('creates item if nested ID is not found', function () {
      let id = `folder${path.sep}not-found`
      let folderItem = controller.createTestItem('folder', 'folder')
      controller.items.add(folderItem)

      let testItem = manager.getOrCreateTestItem(id)
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq(id)
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), id))
    })

    test('creates intermediate items if ID implies contexts', function () {
      let fileId = 'not-found'
      let contextId = `${fileId}[1:1]`
      let testId = `${fileId}[1:1:1]`


      let testItem = manager.getOrCreateTestItem(testId)
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq(testId)
      expect(testItem.canResolveChildren).to.eq(false)
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), testId))

      let contextItem = manager.getTestItem(contextId)
      expect(contextItem).to.not.be.undefined
      expect(contextItem?.id).to.eq(contextId)
      expect(contextItem?.canResolveChildren).to.eq(true)
      testUriMatches(testItem, contextItem?.uri?.fsPath)

      let fileItem = manager.getTestItem(fileId)
      expect(fileItem).to.not.be.undefined
      expect(fileItem?.id).to.eq(fileId)
      expect(fileItem?.canResolveChildren).to.eq(true)
      testUriMatches(testItem, fileItem?.uri?.fsPath)
    })

    test('creates item and parent if parent of nested file is not found', function () {
      let id = `folder${path.sep}not-found`
      let testItem = manager.getOrCreateTestItem(id)
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq(id)

      let folder = manager.getOrCreateTestItem('folder')
      expect(folder?.children.size).to.eq(1)
      expect(folder?.children.get(id)).to.eq(testItem)
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), id))
    })

    suite('creates full item tree for specs within files', function () {
      let fileId = `folder${path.sep}not-found.rb`

      for (const {suite, location} of [
        {suite: 'minitest', location: '[4]'},
        {suite: 'rspec', location: '[1:2]'},
      ]) {
        test(suite, function() {
          let id = `${fileId}${location}`
          let testItem = manager.getOrCreateTestItem(id)
          expect(testItem.id).to.eq(id)
          expect(testItem.parent?.id).to.eq(fileId)

          let folderItem = manager.getTestItem('folder')
          let fileItem = manager.getTestItem(fileId)
          expect(folderItem?.children.size).to.eq(1)
          expect(fileItem?.children.size).to.eq(1)
          testUriMatches(folderItem!, path.resolve(config.getAbsoluteTestDirectory(), 'folder'))
          testUriMatches(fileItem!, path.resolve(config.getAbsoluteTestDirectory(), fileId))
          testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), fileId))
        })
      }
    })
  })
});
