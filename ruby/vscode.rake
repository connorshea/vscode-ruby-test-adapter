$LOAD_PATH << File.expand_path(__dir__)
require "vscode/minitest"

namespace :vscode do
  namespace :minitest do
    desc "List minitest available tests"
    task :list do
      VSCode::Minitest.list
    end

    desc "Run tests (accepts one or more files, folders or file:line formats)"
    task :run do |t|
      args = ARGV.dup.drop_while { |a| a != t.name }.drop(1)
      VSCode::Minitest.run(*args)
    end
  end
end
