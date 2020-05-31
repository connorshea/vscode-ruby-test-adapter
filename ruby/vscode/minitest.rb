require 'minitest'
require "vscode/minitest/tests"
require "vscode/minitest/reporter"
require "vscode/minitest/runner"
require "json"
require "pathname"

module Minitest
  # we don't want tests to autorun
  def self.autorun; end
end

module VSCode
  module_function

  def project_root
    @project_root ||= Pathname.new(Dir.pwd)
  end

  module Minitest
    module_function

    def list(io = $stdout)
      io.sync = true if io.respond_to?(:"sync=")
      data = { version: ::Minitest::VERSION, examples: tests.all }
      json = ENV.key?("PRETTY") ? JSON.pretty_generate(data) : JSON.generate(data)
      io.puts "START_OF_TEST_JSON#{json}END_OF_TEST_JSON"
    end

    def run(*args)
      args = [ENV['TESTS_DIR']] if args.empty?
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
