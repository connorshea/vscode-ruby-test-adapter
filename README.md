# Ruby Test Explorer
**[Install it from the VS Code Marketplace.](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-ruby-test-adapter)**

This is a Ruby Test Explorer extension for the [VS Code Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

![An example screenshot of the extension in use](/img/screenshot.png)

The extension currently only supports Rspec tests.

## Setup

The extension requires that you have Ruby installed along with the `rspec-core` gem (and any other dependencies required by your test suite). It's been tested with Ruby 2.6 and Rspec 3.8, but it should work with most recent versions of Ruby and all versions of Rspec 3.x.

By default, you need to have `rspec` installed via Bundler with a `Gemfile` and `bundle install`, otherwise `bundle exec rspec` won't work. If you want to run your Rspec tests with a command other than `bundle exec rspec`, you can configure the command with the `rubyTestExplorer.rspecCommand` setting.

## Configuration

The following configuration options are available:

Property                            | Description
------------------------------------|---------------------------------------------------------------
`rubyTestExplorer.logpanel`         | Whether to write diagnotic logs to an output panel
`rubyTestExplorer.logfile`          | Write diagnostic logs to the given file
`rubyTestExplorer.rspecCommand`     | Define the command to run Rspec tests with, for example `bundle exec rspec`, `spring rspec`, or `rspec`.
