# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.9.2] - 2023-01-17
### Fixed
- Fix loading tests when symlinks are involved. Thanks [@naveg](https://github.com/naveg)! ([#115](https://github.com/connorshea/vscode-ruby-test-adapter/pull/115))

## [0.9.1] - 2022-08-04
### Fixed
- Fix extension failures related to the way Minitest sets up its seed (or in this case, doesn't). Thanks [@blowmage](https://github.com/blowmage), [@pnomolos](https://github.com/pnomolos), and [@SergeyBurtsev](https://github.com/SergeyBurtsev)! ([#100](https://github.com/connorshea/vscode-ruby-test-adapter/pull/100))

### Internal
- Fix CI failures due to a mistake in `bin/setup`. ([#103](https://github.com/connorshea/vscode-ruby-test-adapter/pull/103))

## [0.9.0] - 2021-05-14
### Added
- Add `rubyTestExplorer.debugCommand` configuration. Allows customizing how the Ruby debugger is accessed, e.g. `bundle exec rdebug-ide`. Thanks [@Juice10](https://github.com/Juice10)! ([#72](https://github.com/connorshea/vscode-ruby-test-adapter/pull/72))

### Changed
- Do not replace underscores in Minitest test names that contain whitespace (e.g. `'Object#foo_bar should work'`). Thanks [@jochenseeber](https://github.com/jochenseeber)! ([#67](https://github.com/connorshea/vscode-ruby-test-adapter/pull/67))
- Remove colon and leading whitespace from beginning of Minitest test names, when relevant. Thanks [@jochenseeber](https://github.com/jochenseeber)! ([#62](https://github.com/connorshea/vscode-ruby-test-adapter/pull/62))

### Fixed
- Make test paths platform agnostic so test reloading works on Windows. Thanks [@cscorley](https://github.com/cscorley)! ([#64](https://github.com/connorshea/vscode-ruby-test-adapter/pull/64))

### Internal
- Add `.vsix` files to `.gitignore` and `.vscodeignore`. Thanks [@jochenseeber](https://github.com/jochenseeber)! ([#61](https://github.com/connorshea/vscode-ruby-test-adapter/pull/61))

## [0.8.1] - 2021-05-14
### Changed
- Increase the minimum VS Code version required for the extension to v1.54 (the February 2021 release).
- Disable the extension in Untrusted Workspaces and Virtual Workspaces. It shouldn't be enabled if the code in the repo isn't trusted (since it essentially executes arbitrary code on-load) and cannot work in a Virtual Workspace since Ruby gems need to be installed and test files must all be available.

### Internal
- Add an automated test suite for the extension. Thanks [@soutaro](https://github.com/soutaro)! ([#74](https://github.com/connorshea/vscode-ruby-test-adapter/pull/74))

## [0.8.0] - 2020-10-25
### Added
- Add support for debugging specs. Thanks [@baelter](https://github.com/baelter) and [@CezaryGapinski](https://github.com/CezaryGapinski)! ([#51](https://github.com/connorshea/vscode-ruby-test-adapter/pull/51))
- Add `filePattern` configuration support for RSpec. ([#51](https://github.com/connorshea/vscode-ruby-test-adapter/pull/51))

### Changed
- **BREAKING**: `minitestFilePattern` renamed to `filePattern` to make it work for both test frameworks we support. ([#51](https://github.com/connorshea/vscode-ruby-test-adapter/pull/51))

### Fixed
- Fix extension failing when `TESTS_DIR` environment variable wasn't set correctly. Thanks [@dwarburt](https://github.com/dwarburt)! ([#47](https://github.com/connorshea/vscode-ruby-test-adapter/pull/47))
- Fix `EXT_DIR` environment variable and line number handling in minitests for Windows OS. Thanks [@CezaryGapinski](https://github.com/CezaryGapinski)! ([#51](https://github.com/connorshea/vscode-ruby-test-adapter/pull/51))

### Internal
- Add RSpec tests.

## [0.7.1] - 2020-02-12
### Changed
- Improve the way errors are handled when loading a project's RSpec tests. ([#43](https://github.com/connorshea/vscode-ruby-test-adapter/pull/43))

## [0.7.0] - 2020-02-12
### Added
- Add support for `Minitest::Spec`-style tests and allow configuration of the minitest files' file pattern with `minitestFilePattern`. Thanks [@baelter](https://github.com/baelter)! ([#34](https://github.com/connorshea/vscode-ruby-test-adapter/pull/34))

### Fixed
- Fix minitest nested tests. Thanks [@baelter](https://github.com/baelter)! ([#37](https://github.com/connorshea/vscode-ruby-test-adapter/pull/37))
- Fix tests not running properly when the path had a space in it. Thanks [@noniq](https://github.com/noniq)! ([#42](https://github.com/connorshea/vscode-ruby-test-adapter/pull/42))

## [0.6.1] - 2019-12-10
### Changed
- Update npm dependencies.

### Fixed
- Fix a typo in the README config table. Thanks [@maryamkaka](https://github.com/maryamkaka)! ([#24](https://github.com/connorshea/vscode-ruby-test-adapter/pull/24))
- Fix a missing require and detection of tests when test files start with `test_` rather than ending with it. Thanks [@agilbert201](https://github.com/agilbert201)! ([#33](https://github.com/connorshea/vscode-ruby-test-adapter/pull/33))

## [0.6.0] - 2019-07-07
### Added
- Add support for multi-root workspaces. The test adapter should now work properly when run with multiple workspaces open at once.

## [0.5.6] - 2019-06-22
### Fixed
- Fix error when running Minitest suites if JSON wasn't loaded. Thanks [@afuerstenau](https://github.com/afuerstenau)! ([#19](https://github.com/connorshea/vscode-ruby-test-adapter/pull/19))

## [0.5.5] - 2019-06-11
### Fixed
- Fix Minitest integration relying implicitly on Rails/ActiveSupport functionality. Thanks [@ttilberg](https://github.com/ttilberg)! ([#17](https://github.com/connorshea/vscode-ruby-test-adapter/pull/17))

## [0.5.4] - 2019-06-04
### Fixed
- Fix the 'open source file' button not working on test suites.

## [0.5.3] - 2019-06-03
### Fixed
- Fix the problem where the test runner was able to get into a state where the tests would never finish, leading to a "Stop" button that was stuck forever.

## [0.5.2] - 2019-06-01
### Fixed
- Fix an issue where the test runner could get stuck without being able to finish.

## [0.5.1] - 2019-06-01
### Added
- Add line decorations in RSpec file where a given test failed. Includes the error message.

### Fixed
- Catch an error that can occur while auto-detecting the test framework where `bundle list` can fail.

## [0.5.0] - 2019-06-01
### Added
- Add Minitest support. Thanks [@cristianbica](https://github.com/cristianbica)! ([#14](https://github.com/connorshea/vscode-ruby-test-adapter/pull/14))
  - The test framework is detected automatically based on the gems installed in the current Bundler environment, no changes should be necessary to continue using the extension. You can also override the test framework manually with the `testFramework` setting if necessary.
- Add an automated test watcher, tests will now reload automatically when a file in the configured test/spec directory changes.

### Changed
- [BREAKING] Renamed `specDirectory` config option to `rspecDirectory` for consistency. If you've configured a special RSpec directory you'll need to change the setting name.

## [0.4.6] - 2019-05-24
### Fixed
- Fix `ActiveSupport#to_json` error when test is not wrapped with a string-based describe/context block. Thanks [@apolzon](https://github.com/apolzon)!

## [0.4.5] - 2019-05-22
### Added
- Add Troubleshooting section to extension README.

## [0.4.4] - 2019-05-22
### Added
- Add better logging throughout the extension.

### Fixed
- Fix a bug that caused an RSpec 'dry-run' to be run before every test run. Test suites should run a bit faster now.

## [0.4.3] - 2019-05-17
### Fixed
- Fix parsing initial JSON so it's less likely to fail when there are other curly braces in the RSpec output.
- Fix 'max buffer' errors by raising the max buffer size to 64MB. Hopefully no one ever hits this.

## [0.4.2] - 2019-05-14
### Changed
- Run tests in a given file at once, rather than one-at-a-time. This makes running tests for a file much faster than it was previously.

## [0.4.1] - 2019-05-14
### Added
- Add support for cancelling a test run.

## [0.4.0] - 2019-05-13
### Added
- The extension now uses a custom RSpec formatter. This is mostly useful for future enhancements.

### Changed
- Test statuses will now be updated live as the test suite is run.

## [0.3.3] - 2019-05-12
### Changed
- Strip repetitive model names from test labels. e.g. "GameGenre Validations blah blah blah" becomes "Validations blah blah blah", since GameGenre can be assumed from the filename.

## [0.3.2] - 2019-05-12
### Fixed
- Fix randomized ordering of tests in the explorer by having RSpec order be defined when getting the tests initially.

## [0.3.1] - 2019-05-11
### Fixed
- Only activate the extension when Ruby files are present. This prevents warning messages about initializing RSpec in projects that don't use Ruby.

## [0.3.0] - 2019-05-11
### Added
- Add proper hierarchy information based on the subdirectory of the spec file.
- Add a warning message if the extension fails to initialize RSpec.
- Add configuration setting for the `spec` directory.

## [0.2.3] - 2019-05-08
### Changed
- Add information to README.
- Improve extension icon.

## [0.2.2] - 2019-04-27
### Changed
- Add setup instructions to the README.

## [0.2.1] - 2019-04-27
### Fixed
- Fix `rspecCommand` configuration not working.

## [0.2.0] - 2019-04-27
### Added
- Add configuration option `rubyTestExplorer.rspecCommand` for setting a custom Rspec command for the runner (default is `bundle exec rspec`).

## [0.1.0] - 2019-04-27

Initial release.

[Unreleased]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.6...v0.6.0
[0.5.6]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.6...v0.5.0
[0.4.6]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/2cc6839...v0.1.0
