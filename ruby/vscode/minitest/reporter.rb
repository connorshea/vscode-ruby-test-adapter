# frozen_string_literal: true

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
        data = vscode_result(result, false)

        io.puts "#{data[:status]}#{data[:exception]}: #{data[:id]}\n"
      end

      def report
        aggregate = results.group_by { |r| r.failure.class }
        aggregate.default = [] # dumb. group_by should provide this
        self.total_time = (::Minitest.clock_time - start_time).round(2)
        self.failures   = aggregate[::Minitest::Assertion].size
        self.errors     = aggregate[::Minitest::UnexpectedError].size
        self.skips      = aggregate[::Minitest::Skip].size
        json = ENV.key?('PRETTY') ? JSON.pretty_generate(vscode_data) : JSON.generate(vscode_data)
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
          summary_line: "Total time: #{total_time}, Runs: #{count}, Assertions: #{assertions}, " \
                        "Failures: #{failures}, Errors: #{errors}, Skips: #{skips}",
          examples: results.map { |r| vscode_result(r, true) }
        }
      end

      def vscode_result(result, is_report)
        base = VSCode::Minitest.tests.find_by(klass: result.klass, method: result.name).dup

        base[:status] = vscode_status(result, is_report)
        base[:pending_message] = result.skipped? ? result.failure.message : nil
        base[:exception] = vscode_exception(result, base, is_report)
        base[:duration] = result.time
        base.compact
      end

      def vscode_status(result, is_report)
        if result.skipped?
          status = 'skipped'
        elsif result.passed?
          status = 'passed'
        else
          e = result.failure.exception
          status = e.class.name == ::Minitest::UnexpectedError.name ? 'errored' : 'failed'
        end
        is_report ? status : status.upcase
      end

      def vscode_exception(result, data, is_report)
        return if result.passed? || result.skipped?

        err = result.failure.exception
        backtrace = expand_backtrace(err.backtrace)
        if is_report
          {
            class: err.class.name,
            message: err.message,
            backtrace: clean_backtrace(backtrace),
            full_backtrace: backtrace,
            position: exception_position(backtrace, data[:full_path]) || data[:line_number]
          }
        else
          "(#{err.class.name}:#{err.message.tr("\n", ' ').strip})"
        end
      end

      def expand_backtrace(backtrace)
        backtrace.map do |line|
          parts = line.split(':')
          parts[0] = File.expand_path(parts[0], VSCode.project_root)
          parts.join(':')
        end
      end

      def clean_backtrace(backtrace)
        backtrace.map do |line|
          next unless line.start_with?(VSCode.project_root.to_s)

          line[VSCode.project_root.to_s] = ''
          line.delete_prefix!('/')
          line.delete_prefix!('\\')
          line
        end
      end

      def exception_position(backtrace, file)
        line = backtrace.find { |frame| frame.start_with?(file) }
        return unless line

        line.split(':')[1].to_i
      end
    end
  end
end
