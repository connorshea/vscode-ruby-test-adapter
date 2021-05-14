require_relative "test_helper"

FILES = {}

FILES["Rakefile"] = <<RUBY
require "rake/testtask"

Rake::TestTask.new(:test) do |t|
  t.libs << "test"
  t.libs << "lib"
  t.test_files = FileList['test/**/*_test.rb']
end
RUBY
FILES["lib/square.rb"] = <<RUBY
class Square
  def square_of(n)
    n * n
  end
end
RUBY
FILES["test/test_helper.rb"] = <<RUBY
$LOAD_PATH.unshift File.expand_path('../lib', __dir__)

require "square"
require "minitest/autorun"

module TestHelper
end
RUBY
FILES["test/square_test.rb"] = <<RUBY
require_relative "test_helper"

class SquareTest < Minitest::Test
  def test_square_of_one
    assert_equal 1, Square.new.square_of(1)
  end

  def test_square_of_two
    assert_equal 3, Square.new.square_of(2)
  end

  def test_square_error
    raise
  end

  def test_square_skip
    skip "This is skip"
  end
end
RUBY

class RakeTaskTest < Minitest::Test
  include TestHelper

  attr_reader :dir

  def setup
    super
    @dir = Pathname(Dir.mktmpdir).realpath

    FILES.each do |path, content|
      path = dir + path

      path.parent.mkpath unless path.parent.directory?
      path.write(content)
    end
  end

  def env
    {
      "TESTS_DIR" => "test",
      "TESTS_PATTERN" => '*_test.rb'
    }
  end

  def test_test_list
    stdout, _, status = Open3.capture3(env, "rake -R #{__dir__}/../.. vscode:minitest:list", chdir: dir.to_s)

    assert_predicate status, :success?
    assert_match(/START_OF_TEST_JSON(.*)END_OF_TEST_JSON/, stdout)

    stdout =~ /START_OF_TEST_JSON(.*)END_OF_TEST_JSON/
    json = JSON.parse($1, symbolize_names: true)

    assert_equal(
      [
        {
          description: "square of one",
          full_description: "square of one",
          file_path: "./test/square_test.rb",
          full_path: (dir + "test/square_test.rb").to_s,
          line_number: 4,
          klass: "SquareTest",
          method: "test_square_of_one",
          runnable: "SquareTest",
          id: "./test/square_test.rb[4]"
        },
        {
          description: "square of two",
          full_description: "square of two",
          file_path: "./test/square_test.rb",
          full_path: (dir + "test/square_test.rb").to_s,
          line_number: 8,
          klass: "SquareTest",
          method: "test_square_of_two",
          runnable: "SquareTest",
          id: "./test/square_test.rb[8]"
        },
        {
          description: "square error",
          full_description: "square error",
          file_path: "./test/square_test.rb",
          full_path: (dir + "test/square_test.rb").to_s,
          line_number: 12,
          klass: "SquareTest",
          method: "test_square_error",
          runnable: "SquareTest",
          id: "./test/square_test.rb[12]"
        },
        {
          description: "square skip",
          full_description: "square skip",
          file_path: "./test/square_test.rb",
          full_path: (dir + "test/square_test.rb").to_s,
          line_number: 16,
          klass: "SquareTest",
          method: "test_square_skip",
          runnable: "SquareTest",
          id: "./test/square_test.rb[16]"
        }
      ],
      json[:examples]
    )
  end

  def test_test_run_all
    stdout, _, status = Open3.capture3(env, "rake -R #{__dir__}/../.. vscode:minitest:run test", chdir: dir.to_s)

    refute_predicate status, :success?
    assert_match(/START_OF_TEST_JSON(.*)END_OF_TEST_JSON/, stdout)

    stdout =~ /START_OF_TEST_JSON(.*)END_OF_TEST_JSON/
    json = JSON.parse($1, symbolize_names: true)

    examples = json[:examples]

    assert_equal 4, examples.size

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square error", example[:description]
      assert_equal "failed", example[:status]
      assert_nil example[:pending_message]
      refute_nil example[:exception]
      assert_equal "Minitest::UnexpectedError", example.dig(:exception, :class)
      assert_match(/RuntimeError:/, example.dig(:exception, :message))
      assert_instance_of Array, example.dig(:exception, :backtrace)
      assert_instance_of Array, example.dig(:exception, :full_backtrace)
      assert_equal 13, example.dig(:exception, :position)
    end

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square of one", example[:description]
      assert_equal "passed", example[:status]
      assert_nil example[:pending_message]
      assert_nil example[:exception]
    end

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square of two", example[:description]
      assert_equal "failed", example[:status]
      assert_nil example[:pending_message]
      refute_nil example[:exception]
      assert_equal "Minitest::Assertion", example.dig(:exception, :class)
      assert_equal "Expected: 3\n  Actual: 4", example.dig(:exception, :message)
      assert_instance_of Array, example.dig(:exception, :backtrace)
      assert_instance_of Array, example.dig(:exception, :full_backtrace)
      assert_equal 9, example.dig(:exception, :position)
    end

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square skip", example[:description]
      assert_equal "failed", example[:status]
      assert_equal "This is skip", example[:pending_message]
      assert_nil example[:exception]
    end
  end

  def test_test_run_file
    stdout, _, status = Open3.capture3(env, "rake -R #{__dir__}/../.. vscode:minitest:run test/square_test.rb", chdir: dir.to_s)

    refute_predicate status, :success?
    assert_match(/START_OF_TEST_JSON(.*)END_OF_TEST_JSON/, stdout)

    stdout =~ /START_OF_TEST_JSON(.*)END_OF_TEST_JSON/
    json = JSON.parse($1, symbolize_names: true)

    examples = json[:examples]

    assert_equal 4, examples.size
  end

  def test_test_run_file_line
    stdout, _, status = Open3.capture3(env, "rake -R #{__dir__}/../.. vscode:minitest:run test/square_test.rb:4 test/square_test.rb:16", chdir: dir.to_s)

    assert_predicate status, :success?
    assert_match(/START_OF_TEST_JSON(.*)END_OF_TEST_JSON/, stdout)

    stdout =~ /START_OF_TEST_JSON(.*)END_OF_TEST_JSON/
    json = JSON.parse($1, symbolize_names: true)

    examples = json[:examples]

    assert_equal 2, examples.size

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square of one", example[:description]
      assert_equal "passed", example[:status]
    end

    assert_any(examples, pass_count: 1) do |example|
      assert_equal "square skip", example[:description]
      assert_equal "failed", example[:status]
    end
  end
end
