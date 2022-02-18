# frozen_string_literal: true

require 'rspec/core'
require 'rspec/core/formatters/base_formatter'
require 'json'

class CustomFormatter < RSpec::Core::Formatters::BaseFormatter
  RSpec::Core::Formatters.register self,
    :message,
    :dump_summary,
    :stop,
    :seed,
    :close,
    :example_passed,
    :example_failed,
    :example_pending

  attr_reader :output_hash

  def initialize(output)
    super
    @output_hash = {
      version: RSpec::Core::Version::STRING
    }
  end

  def message(notification)
    (@output_hash[:messages] ||= []) << notification.message
  end

  def dump_summary(summary)
    @output_hash[:summary] = {
      duration: summary.duration,
      example_count: summary.example_count,
      failure_count: summary.failure_count,
      pending_count: summary.pending_count,
      errors_outside_of_examples_count: summary.errors_outside_of_examples_count
    }
    @output_hash[:summary_line] = summary.totals_line
  end

  def stop(notification)
    @output_hash[:examples] = notification.examples.map do |example|
      format_example(example).tap do |hash|
        e = example.exception
        if e
          hash[:exception] = {
            class: e.class.name,
            message: e.message,
            backtrace: e.backtrace
          }
        end
      end
    end
  end

  def seed(notification)
    return unless notification.seed_used?

    @output_hash[:seed] = notification.seed
  end

  def close(_notification)
    output.write "START_OF_TEST_JSON#{@output_hash.to_json}END_OF_TEST_JSON\n"
  end

  def example_passed(notification)
    output.write "PASSED: #{notification.example.id}\n"
  end

  def example_failed(notification)
    output.write "FAILED: #{notification.example.id}\n"
    # This isn't exposed for simplicity, need to figure out how to handle this later.
    # output.write "#{notification.exception.backtrace.to_json}\n"
  end

  def example_pending(notification)
    output.write "PENDING: #{notification.example.id}\n"
  end

  private

  # Properties of example:
  #   block
  #   description_args
  #   description
  #   full_description
  #   described_class
  #   file_path
  #   line_number
  #   location
  #   absolute_file_path
  #   rerun_file_path
  #   scoped_id
  #   type
  #   execution_result
  #   example_group
  #   shared_group_inclusion_backtrace
  #   last_run_status
  def format_example(example)
    {
      id: example.id,
      description: example.description,
      full_description: example.full_description,
      status: example.execution_result.status.to_s,
      file_path: example.metadata[:file_path],
      line_number: example.metadata[:line_number],
      type: example.metadata[:type],
      pending_message: example.execution_result.pending_message
    }
  end
end
