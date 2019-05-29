module VSCode
  module Minitest
    class Reporter < ::Minitest::Reporter
      attr_accessor :assertions, :count, :results, :start_time, :total_time, :failures, :errors, :skips

      def initialize(io = $stdout, options = {})
        super
        self.assertions = 0
        self.count      = 0
        self.results    = []
      end

      def start
        self.start_time = ::Minitest.clock_time
      end

      def record result
        self.count += 1
        self.assertions += result.assertions
        results << result
        data = vscode_result(result)
        io.puts "\n#{data[:status].upcase}: #{data[:id]}\n"
      end

      def report
        aggregate = results.group_by { |r| r.failure.class }
        aggregate.default = [] # dumb. group_by should provide this
        self.total_time = (::Minitest.clock_time - start_time).round(2)
        self.failures   = aggregate[::Minitest::Assertion].size
        self.errors     = aggregate[::Minitest::UnexpectedError].size
        self.skips      = aggregate[::Minitest::Skip].size
        io.puts "START_OF_MINITEST_JSON#{JSON.generate(vscode_data.as_json)}END_OF_MINITEST_JSON"
      end

      def passed?
        failures == 0
      end

      def vscode_data
        {
          version: ::Minitest::VERSION,
          summary: { duration: total_time, example_count: assertions, failure_count: failures, pending_count: skips, errors_outside_of_examples_count: errors },
          summary_line: "Total time: #{total_time}, Runs: #{count}, Assertions: #{assertions}, Failures: #{failures}, Errors: #{errors}, Skips: #{skips}",
          examples: results.map { |r| vscode_result(r) }
        }
      end

      def vscode_result(r)
        base = VSCode::Minitest.tests.find_by(klass: r.klass, method: r.name).deep_dup
        if r.skipped?
          base[:status] = "failed"
          base[:pending_message] = r.failure.message
        elsif r.passed?
          base[:status] = "passed"
        else
          base[:status] = "failed"
          base[:pending_message] = nil
          e = r.failure.exception
          base[:exception] = {
            class: e.class.name,
            message: e.message,
            backtrace: Rails::BacktraceCleaner.new.clean(e.backtrace),
            full_backtrace: e.backtrace
          }
        end
        base
      end
    end
  end
end
