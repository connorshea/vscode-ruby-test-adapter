# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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

[Unreleased]: https://github.com/connorshea/vscode-ruby-test-adapter/compare/v0.5.0...HEAD
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
