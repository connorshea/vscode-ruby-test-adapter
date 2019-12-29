module VSCode
  module Minitest
    class Reporter < ::Minitest::Reporter
      attr_accessor :assertions, :count, :results, :start_time, :total_time, :failures, :errors, :skips

      def initialize(io = $stdout, options = {})
        super
        io.sync = true if io.respond_to?(:"sync=")
        self.assertions = 0
        self.count      = 0
        self.results    = []
      end

      def start
        self.start_time = ::Minitest.clock_time
      end

      def prerecord(klass, meth)
        data = VSCode::Minitest.tests.find_by(klass: klass.to_s, method: meth)
        io.puts "\nRUNNING: #{data[:id]}\n"
      end

      def record(result)
        self.count += 1
        self.assertions += result.assertions
        results << result
        data = vscode_result(result)
        if result.skipped?
          io.puts "\nPENDING: #{data[:id]}\n"
        else
          io.puts "\n#{data[:status].upcase}: #{data[:id]}\n"
        end
      end

      def report
        aggregate = results.group_by { |r| r.failure.class }
        aggregate.default = [] # dumb. group_by should provide this
        self.total_time = (::Minitest.clock_time - start_time).round(2)
        self.failures   = aggregate[::Minitest::Assertion].size
        self.errors     = aggregate[::Minitest::UnexpectedError].size
        self.skips      = aggregate[::Minitest::Skip].size
        json = ENV.key?("PRETTY") ? JSON.pretty_generate(vscode_data) : JSON.generate(vscode_data)
        io.puts "START_OF_TEST_JSON#{json}END_OF_TEST_JSON"
      end

      def passed?
        failures.zero?
      end

      def vscode_data
        {
          version: ::Minitest::VERSION,
          summary: {
            duration: total_time,
            example_count: assertions,
            failure_count: failures,
            pending_count: skips,
            errors_outside_of_examples_count: errors
          },
          summary_line: "Total time: #{total_time}, Runs: #{count}, Assertions: #{assertions}, Failures: #{failures}, Errors: #{errors}, Skips: #{skips}",
          examples: results.map { |r| vscode_result(r) }
        }
      end

      def vscode_result(r)
        base = VSCode::Minitest.tests.find_by(klass: r.klass, method: r.name).dup
        if r.skipped?
          base[:status] = "failed"
          base[:pending_message] = r.failure.message
        elsif r.passed?
          base[:status] = "passed"
        else
          base[:status] = "failed"
          base[:pending_message] = nil
          e = r.failure.exception
          backtrace = expand_backtrace(e.backtrace)
          base[:exception] = {
            class: e.class.name,
            message: e.message,
            backtrace: clean_backtrace(backtrace),
            full_backtrace: backtrace,
            position: exception_position(backtrace, base[:full_path]) || base[:line_number]
          }
        end
        base
      end

      def expand_backtrace(backtrace)
        backtrace.map do |line|
          parts = line.split(":")
          parts[0] = File.expand_path(parts[0], VSCode.project_root)
          parts.join(":")
        end
      end

      def clean_backtrace(backtrace)
        backtrace.map do |line|
          next unless line.start_with?(VSCode.project_root.to_s)
          line.gsub(VSCode.project_root.to_s + "/", "")
        end.compact
      end

      def exception_position(backtrace, file)
        line = backtrace.find { |frame| frame.start_with?(file) }
        return unless line
        line.split(":")[1].to_i
      end
    end
  end
end
