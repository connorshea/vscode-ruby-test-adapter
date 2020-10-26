$LOAD_PATH << File.expand_path(__dir__)
require "vscode/minitest"

VSCode::Minitest.run(*ARGV)
