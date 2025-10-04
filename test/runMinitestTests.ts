import path from 'path';
import cp from 'child_process';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { testExplorerExtensionId } from 'vscode-test-adapter-api';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    cp.spawnSync(cli, [...args, '--install-extension', testExplorerExtensionId], {
      encoding: 'utf-8',
      stdio: 'inherit'
    });

    await runTests(
      {
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, './suite/frameworks/minitest/index'),
        launchArgs: [path.resolve(extensionDevelopmentPath, 'test/fixtures/minitest')]
      }
    );
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
