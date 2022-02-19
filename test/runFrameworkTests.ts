import * as path from 'path'
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

//require('module-alias/register')

const extensionDevelopmentPath = path.resolve(__dirname, '../');
const allowedSuiteArguments = ["rspec", "minitest", "unitTests"]

async function main(framework: string) {
  let vscodeExecutablePath = await downloadAndUnzipVSCode('stable')

  await runTestSuite(vscodeExecutablePath, framework)
}

/**
 * Sets up and runs a test suite in a child instance of VSCode
 *
 * If this is run
 *
 * @param suite Name of the test suite to run (one of the folders in test/suite)
 * @param vscodeExecutablePath Path to VS executable to use. If not provided, or doesn't exist,
 *   the extension test will download the latest stable VS code to run the tests with
 */
async function runTestSuite(vscodeExecutablePath: string, suite: string) {
  let testsPath = path.resolve(extensionDevelopmentPath, `test/suite`)
  let fixturesPath = path.resolve(extensionDevelopmentPath, `test/fixtures/${suite}`)

  console.debug(`testsPath: ${testsPath}`)
  console.debug(`fixturesPath: ${fixturesPath}`)

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: testsPath,
    extensionTestsEnv: { "TEST_SUITE": suite },
    launchArgs: suite == "unitTests" ? [] : [fixturesPath],
    vscodeExecutablePath: vscodeExecutablePath
  }).catch((error: any) => {
    console.error(error);
    console.error(`Failed to run ${suite} tests`)
  })
}

function printHelpAndExit() {
  console.log("")
  console.log("Please run this script with one of the following available test suite names:")
  allowedSuiteArguments.forEach(name => {
    console.log(`  - ${name}`)
  });
  console.log("")
  console.log("Example:")
  console.log("node ./out/test/runTestSuites.js rspec")

  process.exit(1)
}

// Check a test suite argument was actually given
if (process.argv.length < 3) {
  console.error("No test suite requested!")
  printHelpAndExit()
}

let suite = process.argv[2]
// Check the test suite argument is one that we accept
if (!allowedSuiteArguments.includes(suite)) {
  console.error(`Invalid test suite requested: ${suite}`)
  printHelpAndExit()
}

console.info(`Running ${suite} tests...`)
main(process.argv[2])
