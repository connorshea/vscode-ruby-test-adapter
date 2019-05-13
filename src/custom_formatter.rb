require "rspec/core"
require "rspec/core/formatters/base_formatter"
require 'json'

class CustomFormatter < RSpec::Core::Formatters::BaseFormatter
  RSpec::Core::Formatters.register self, :message, :dump_summary, :stop, :seed, :close

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
    output.write @output_hash.to_json
  end

  # block
  # description_args
  # description
  # full_description
  # described_class
  # file_path
  # line_number
  # location
  # absolute_file_path
  # rerun_file_path
  # scoped_id
  # type
  # execution_result
  # example_group
  # shared_group_inclusion_backtrace
  # last_run_status

  private

  def format_example(example)
    {
      id: example.id,
      description: example.description,
      full_description: example.full_description,
      status: example.execution_result.status.to_s,
      file_path: example.metadata[:file_path],
      line_number: example.metadata[:line_number],
      example_group_description_args: example.metadata[:example_group][:description_args],
      # example_group: example.metadata[:example_group][:parent_example_group],
      type: example.metadata[:type],
      description_args: example.metadata[:description_args],
      pending_message: example.execution_result.pending_message,
      block: example.metadata[:block]
    }
  end
end
