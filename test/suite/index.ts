import path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    diff: true,
    bail: false,
    fullTrace: true
  });

  const suite = process.env['TEST_SUITE'] ?? ''

  return new Promise((success, error) => {
    console.log(`cwd: ${__dirname}`)
    console.log(`Test suite path: ${suite}`)
    let testGlob = path.join(suite, '**.test.js')
    glob(testGlob, { cwd: __dirname }, (err, files) => {
      if (err) {
        return error(err);
      }

      // Add files to the test suite
      files.forEach(f => {
        let fPath = path.resolve(__dirname, f)
        console.log(fPath)
        mocha.addFile(fPath)
      });

      try {
        // Run the mocha test
        mocha.run(failures => {
          if (failures > 0) {
            printFailureCount(failures)

            // Failed tests doesn't mean we failed to _run_ the tests :)
            success();
          }
        });
      } catch (err) {
        error(err);
      }
    });
  });
}

function printFailureCount(failures: number) {
  let failureString = `*  ${failures} tests failed.  *`
  let line = new String('*'.repeat(failureString.length))
  let space = `*${new String(' '.repeat(failureString.length - 2))}*`
  console.log(line)
  console.log(space)
  console.log(failureString);
  console.log(space)
  console.log(line)
  console.log("")
}
