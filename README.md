# Ruby Test Explorer
**[Install it from the VS Code Marketplace.](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-ruby-test-adapter)**

This is a Ruby Test Explorer extension for the [VS Code Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

![An example screenshot of the extension in use](/img/screenshot.png)

The extension supports the RSpec and Minitest test frameworks.

## Setup

### RSpec

The extension needs Ruby and the `rspec-core` gem installed (and any other dependencies required by your test suite). It's been tested with Ruby 2.6 and Rspec 3.8, but it should work with most recent versions of Ruby and all versions of Rspec 3.x above 3.6.0 (versions before 3.6.0 do not currently work because they don't expose an `id` property for tests in the JSON formatter).

By default, you need to have `rspec` installed via Bundler with a `Gemfile` and `bundle install`, otherwise `bundle exec rspec` won't work. If you want to run your Rspec tests with a command other than `bundle exec rspec`, you can configure the command with the `rubyTestExplorer.rspecCommand` setting.

### Minitest

The extension needs Ruby and the `minitest` gem installed (and any other dependencies required by your test suite). It's been tested with Ruby 2.5 and 2.6, and Minitest 5.x. It should work with most recent versions of Ruby and Minitest.

## Features

Currently supported:

- Support for RSpec and Minitest suites.
- Automatic detection of test framework (based on gems listed by `bundle list`), as well as manual override if necessary.
- Running individual tests.
- Running full test suite.
- Running tests for a specific file.
- Viewing test output for failed tests (click the test in the test explorer sidebar to open the Output view).
- Line decorations in test files when a test fails.
- Displaying test statuses. Success, failure, and pending (called 'skipped' in the extension).
- Live test status updates as the test suite runs.
- File locations for each test.
- Configurable RSpec command.
- Configurable RSpec `spec/` directory.
- Configurable Minitest command.
- Configurable Minitest `test/` directory.
- Test hierarchy information.
- Automatic reloading of test suite info when a file in the test directory changes.
- Multi-root workspaces.

## Configuration

The following configuration options are available:

Property                               | Description
---------------------------------------|---------------------------------------------------------------
`rubyTestExplorer.logpanel`            | Whether to write diagnotic logs to an output panel.
`rubyTestExplorer.logfile`             | Write diagnostic logs to the given file.
`rubyTestExplorer.testFramework`       | `none`, `auto`, `rspec`, or `minitest`. `auto` by default, which automatically detects the test framework based on the gems listed by Bundler. Can disable the extension functionality with `none` or set the test framework explicitly, if auto-detect isn't working properly.
`rubyTestExplorer.filePattern`         | Define the pattern to match test files by, for example `["*_test.rb", "test_*.rb", "*_spec.rb"]`.
`rubyTestExplorer.debuggerHost`        | Define the host to connect the debugger to, for example `127.0.0.1`.
`rubyTestExplorer.debuggerPort`        | Define the port to connect the debugger to, for example `1234`.
`rubyTestExplorer.rspecCommand`        | Define the command to run RSpec tests with, for example `bundle exec rspec`, `spring rspec`, or `rspec`.
`rubyTestExplorer.rspecDirectory`      | Define the relative directory of the specs in a given workspace, for example `./spec/`.
`rubyTestExplorer.minitestCommand`     | Define how to run Minitest with Rake, for example `./bin/rake`, `bundle exec rake` or `rake`. Must be a Rake command.
`rubyTestExplorer.minitestDirectory`   | Define the relative location of your `test` directory, for example `./test/`.

## Troubleshooting

If the extension doesn't work for you, here are a few things you can try:

- Make sure you've run `bundle install` and that any gems specified in your `Gemfile.lock` have been installed (assuming you're using Bundler).
- Enable the `rubyTestExplorer.logpanel` config setting and take a look at the output in Output > Ruby Test Explorer Log. This should show what the extension is doing and provide more context on what's happening behind the scenes. (You can alternatively use `rubyTestExplorer.logfile` to log to a specific file instead).
- Check the VS Code Developer Tools (Command Palette > 'Developer: Toggle Developer Tools') for any JSON parsing errors, or anything else that looks like it might come from the extension. That could be a bug in the extension, or a problem with your setup.
- If you're using RSpec, make sure you're using a recent version of the `rspec-core` gem. If you're on a version prior to 3.6.0, the extension may not work.
- If you're using RSpec, make sure that the RSpec command and `spec` directory are configured correctly. By default, tests are run with `bundle exec rspec` and the tests are assumed to be in the `./spec/` directory. You can configure these with `rubyTestExplorer.rspecCommand` and `rubyTestExplorer.rspecDirectory` respectively.
- If the test suite info isn't loading, your `testFramework` config may be set to `none` or the auto-detect may be failing to determine the test framework. Try setting the `testFramework` config to `rspec` or `minitest` depending on what you want to use.
- If you are using rvm you may need to manually specify the gemset `rvm use 2.5.0@gemset_name do ./bin/rspec` for example

If all else fails or you suspect something is broken with the extension, please feel free to open an issue! :)

## Contributing

You'll need VS Code, Node (any version >= 8 should probably work), and Ruby installed.

- Clone the repository: `git clone https://github.com/connorshea/vscode-ruby-test-adapter`
- Run `npm install` to install dependencies.
- Open the directory in VS Code.
- Run `npm run watch` or start the `watch` Task in VS Code to get the TypeScript compiler running.
- Go to the Debug section in the sidebar and run "Ruby adapter". This will start a separate VS Code instance for testing the extension in. It gets updated code whenever "Reload Window" is run in the Command Palette.
  - You'll need a Ruby project if you want to actually use the extension to run tests, I generally use my project [VideoGameList](https://github.com/connorshea/VideoGameList) for testing, but any Ruby project with RSpec or Minitest tests will work.

This extension is based on [the example test adapter](https://github.com/hbenl/vscode-example-test-adapter), it may be useful to check that repository for more information. Test adapters for other languages may also be useful references.

### Publishing a new version

See [the VS Code extension docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for more info.

Before publishing, make sure to update the `CHANGELOG.md` file. You also need to be logged in to `vsce`. When creating a Personal Access Token to log in, make sure to give it access to _all organizations_ in your Azure DevOps account. Otherwise, it won't work correctly.

`vsce publish VERSION`, e.g. `vsce publish 1.0.0` will automatically handle creating the git commit and git tag, updating the `package.json`, and publishing the new version to the Visual Studio Marketplace. You'll need to manually run `git push` and `git push --tags` after publishing.

Alternatively, you can bump the extension version with `vsce publish major`, `vsce publish minor`, or `vsce publish patch`.
