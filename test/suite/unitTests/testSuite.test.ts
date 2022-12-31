import { expect } from 'chai';
import { before, beforeEach } from 'mocha';
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'
import path from 'path'

import { Config } from '../../../src/config';
import { TestSuite } from '../../../src/testSuite';
import { StubTestController } from '../../stubs/stubTestController';
import { StubTestItem } from '../../stubs/stubTestItem';
import { noop_logger, testUriMatches } from '../helpers';

suite('TestSuite', function () {
  let mockConfig: Config = mock<Config>();
  const config: Config = instance(mockConfig)
  let controller: vscode.TestController;
  let testSuite: TestSuite;

  before(function () {
    let relativeTestPath = 'path/to/spec'
    when(mockConfig.getRelativeTestDirectory()).thenReturn(relativeTestPath)
    when(mockConfig.getAbsoluteTestDirectory()).thenReturn(path.resolve(relativeTestPath))
  });

  beforeEach(function () {
    controller = new StubTestController()
    testSuite = new TestSuite(noop_logger(), controller, instance(mockConfig))
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
        expect(testSuite.normaliseTestId(arg)).to.eq(expected);
      });
    });
  });

  suite('#deleteTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'

    beforeEach(function () {
      controller.items.add(new StubTestItem(id, label))
    })

    test('deletes only the specified test item', function () {
      let secondTestItem = new StubTestItem('test-id-2', 'test-label-2')
      controller.items.add(secondTestItem)
      expect(controller.items.size).to.eq(2)

      testSuite.deleteTestItem(id)

      expect(controller.items.size).to.eq(1)
      expect(controller.items.get('test-id-2')).to.eq(secondTestItem)
    })

    test('does nothing if ID not found', function () {
      expect(controller.items.size).to.eq(1)

      testSuite.deleteTestItem('test-id-2')

      expect(controller.items.size).to.eq(1)
    })
  });

  suite('#getTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'
    const testItem = new StubTestItem(id, label)
    const childId = 'folder/child-test'
    const childItem = new StubTestItem(childId, 'child-test')
    const folderItem = new StubTestItem('folder', 'folder')

    beforeEach(function () {
      controller.items.add(testItem)
      folderItem.children.add(childItem)
      controller.items.add(folderItem)
    })

    test('gets the specified test if ID is found', function () {
      expect(testSuite.getTestItem(id)).to.eq(testItem)
    })

    test('returns undefined if ID is not found', function () {
      expect(testSuite.getTestItem('not-found')).to.be.undefined
    })

    test('gets the specified nested test if ID is found', function () {
      expect(testSuite.getTestItem(childId)).to.eq(childItem)
    })

    test('returns undefined if nested ID is not found', function () {
      expect(testSuite.getTestItem('folder/not-found')).to.be.undefined
    })

    test('returns undefined if parent of nested ID is not found', function () {
      expect(testSuite.getTestItem('not-found/child-test')).to.be.undefined
    })
  })

  suite('#getOrCreateTestItem()', function () {
    const id = 'test-id'
    const label = 'test-label'
    const testItem = new StubTestItem(id, label)
    const childId = `folder${path.sep}child-test`
    const childItem = new StubTestItem(childId, 'child-test')

    test('gets the specified item if ID is found', function () {
      controller.items.add(testItem)
      expect(testSuite.getOrCreateTestItem(id)).to.eq(testItem)
    })

    test('creates item if ID is not found', function () {
      let testItem = testSuite.getOrCreateTestItem('not-found')
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq('not-found')
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), 'not-found'))
    })

    test('gets the specified nested test if ID is found', function () {
      let folderItem = new StubTestItem('folder', 'folder')
      controller.items.add(testItem)
      folderItem.children.add(childItem)
      controller.items.add(folderItem)

      expect(testSuite.getOrCreateTestItem(childId)).to.eq(childItem)
    })

    test('creates item if nested ID is not found', function () {
      let id = `folder${path.sep}not-found`
      let folderItem = new StubTestItem('folder', 'folder')
      controller.items.add(folderItem)

      let testItem = testSuite.getOrCreateTestItem(id)
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq(id)
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), id))
    })

    test('creates item and parent if parent of nested ID is not found', function () {
      let id = `folder${path.sep}not-found`
      let testItem = testSuite.getOrCreateTestItem(id)
      expect(testItem).to.not.be.undefined
      expect(testItem?.id).to.eq(id)

      let folder = testSuite.getOrCreateTestItem('folder')
      expect(folder?.children.size).to.eq(1)
      expect(folder?.children.get(id)).to.eq(testItem)
      testUriMatches(testItem, path.resolve(config.getAbsoluteTestDirectory(), id))
    })
  })
});