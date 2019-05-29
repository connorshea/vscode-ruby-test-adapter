require "vscode/minitest/tests"
require "vscode/minitest/reporter"
require "vscode/minitest/runner"

module Minitest
  # we don't want tests to autorun
  def self.autorun
  end
end

module VSCode
  module_function
  def project_root
    @project_root ||= Pathname.new(Dir.pwd)
  end

  module Minitest
    module_function

    def list
      data = { version: ::Minitest::VERSION, examples: tests.all }
      puts "START_OF_MINITEST_JSON#{JSON.generate(data.as_json)}END_OF_MINITEST_JSON"
    end

    def run(*args)
      args = ["./test/"] if args.empty?
      reporter = Reporter.new
      reporter.start
      runner = Runner.new(reporter: reporter)
      args.each { |arg| runner.add(arg) }
      runner.run
      reporter.report
      exit(reporter.passed?)
    end

    def tests
      @tests ||= Tests.new
    end
  end
end
