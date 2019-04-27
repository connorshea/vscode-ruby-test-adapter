# Ruby Test Explorer
**[Install it from the VS Code Marketplace.](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-ruby-test-adapter)**

This is a Ruby Test Explorer extension for the [VS Code Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer) extension.

![An example screenshot of the extension in use](/img/screenshot.png)

The extension currently only supports Rspec tests.


## Configuration

The following configuration options are available:

Property                            | Description
------------------------------------|---------------------------------------------------------------
`rubyTestExplorer.logpanel`         | Whether to write diagnotic logs to an output panel
`rubyTestExplorer.logfile`          | Write diagnostic logs to the given file
`rubyTestExplorer.rspecCommand`     | Define the command to run Rspec tests with, for example `bundle exec rspec`, `spring rspec`, or `rspec`.
