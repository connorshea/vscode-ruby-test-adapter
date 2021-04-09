import * as path from 'path';
import * as cp from 'child_process';

import { runTests, downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from 'vscode-test';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable')

    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath)
    cp.spawnSync(cliPath, ['--install-extension', 'hbenl.vscode-test-explorer'], {
      encoding: 'utf-8',
      stdio: 'inherit'
    })

    await runTests(
      {
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, './suite/minitest/index'),
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
