# Ruby Test Explorer
**[Install it from the VS Code Marketplace.](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-ruby-test-adapter)**

This is a Ruby Test Explorer extension for the [VS Code Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

![An example screenshot of the extension in use](/img/screenshot.png)

The extension currently only supports RSpec tests.
If someone would like to contribute Minitest support, I'd be willing to merge it, but I probably won't add it myself.

## Setup

The extension requires that you have Ruby installed along with the `rspec-core` gem (and any other dependencies required by your test suite). It's been tested with Ruby 2.6 and Rspec 3.8, but it should work with most recent versions of Ruby and all versions of Rspec 3.x above 3.6.0 (versions before 3.6.0 do not currently work because they don't expose an `id` property for tests in the JSON formatter).

By default, you need to have `rspec` installed via Bundler with a `Gemfile` and `bundle install`, otherwise `bundle exec rspec` won't work. If you want to run your Rspec tests with a command other than `bundle exec rspec`, you can configure the command with the `rubyTestExplorer.rspecCommand` setting.

## Features

Currently supported:

- Running individual tests.
- Running the full test suite.
- Running tests for a specific file.
- Viewing test output for failed tests (click the test in the test explorer sidebar to open the Output view).
- Displaying test statuses. Success, failure, and pending (called 'skipped' in the extension).
- Live test status updates as the test suite runs.
- File locations for each test.
- Configurable RSpec command.
- Configurable RSpec `spec/` directory.
- Test hierarchy information.

## Configuration

The following configuration options are available:

Property                            | Description
------------------------------------|---------------------------------------------------------------
`rubyTestExplorer.logpanel`         | Whether to write diagnotic logs to an output panel
`rubyTestExplorer.logfile`          | Write diagnostic logs to the given file
`rubyTestExplorer.rspecCommand`     | Define the command to run RSpec tests with, for example `bundle exec rspec`, `spring rspec`, or `rspec`.
`rubyTestExplorer.specDirectory`    | Define the relative directory where the specs are located in a given workspace, for example `./spec/`.

## TODO

The extension is still in the early stages of development. I intend to improve it over time, and would appreciate any help or suggestions that others can offer :)

- Implement a test definitions watcher ([#5](https://github.com/connorshea/vscode-ruby-test-adapter/issues/5))
- Add unit tests ([#9](https://github.com/connorshea/vscode-ruby-test-adapter/issues/9))

## Contributing

You'll need VS Code, Node (any version >= 8 should probably work), and Ruby installed.

- Clone the repository: `git clone https://github.com/connorshea/vscode-ruby-test-adapter`
- Run `npm install` to install dependencies.
- Open the directory in VS Code.
- Run `npm run watch` or start the `watch` Task in VS Code to get the TypeScript compiler running.
- Go to the Debug section in the sidebar and run "Ruby adapter". This will start a separate VS Code instance for testing the extension in. It gets updated code whenever "Reload Window" is run in the Command Palette.
  - You'll need a Ruby project if you want to actually use the extension to run tests, I generally use my project [VideoGameList](https://github.com/connorshea/VideoGameList) for testing, but any Ruby project with RSpec tests will work.

This extension is based on [the example test adapter](https://github.com/hbenl/vscode-example-test-adapter), it may be useful to check that repository for more information. Test adapters for other languages may also be useful references.

### Publishing a new version

See [the VS Code extension docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for more info.

Before publishing, make sure to update the `CHANGELOG.md` file. You also need to be logged in to `vsce`.

`vsce publish VERSION`, e.g. `vsce publish 1.0.0` will automatically handle creating the git commit and git tag, updating the `package.json`, and publishing the new version to the Visual Studio Marketplace. You'll need to manually run `git push` and `git push --tags` after publishing.

Alternatively, you can bump the extension version with `vsce publish major`, `vsce publish minor`, or `vsce publish patch`.
