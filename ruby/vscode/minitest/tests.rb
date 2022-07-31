require "rake"

module VSCode
  module Minitest
    class Tests
      def all
        @all ||= begin
          load_files
          build_list
        end
      end

      def find_by(**filters)
        all.find do |test|
          test.values_at(*filters.keys) == filters.values
        end
      end

      def load_files
        # Take the tests dir in the format of `./test/` and turn it into `test`.
        test_dir = ENV['TESTS_DIR'] || './test/'
        test_dir = test_dir.gsub('./', '')
        test_dir = test_dir[0...-1] if test_dir.end_with?('/')
        $LOAD_PATH << VSCode.project_root.join(test_dir).to_s
        patterns = ENV.fetch('TESTS_PATTERN').split(',').map { |p| "#{test_dir}/**/#{p}" }
        file_list = Rake::FileList[*patterns]
        file_list.each { |path| require File.expand_path(path) }
      end

      def build_list
        if ::Minitest.respond_to?(:seed) && ::Minitest.seed.nil?
          ::Minitest.seed = (ENV['SEED'] || srand).to_i % 0xFFFF
        end

        tests = []
        ::Minitest::Runnable.runnables.map do |runnable|
          file_tests = runnable.runnable_methods.map do |test_name|
            path, line = runnable.instance_method(test_name).source_location
            full_path = File.expand_path(path, VSCode.project_root)
            path = full_path.gsub(VSCode.project_root.to_s, ".")
            path = "./#{path}" unless path.match?(/^\./)
            description = test_name.gsub(/^test_[:\s]*/, "")
            description = description.tr("_", " ") unless description.match?(/\s/)

            {
              description: description,
              full_description: description,
              file_path: path,
              full_path: full_path,
              line_number: line,
              klass: runnable.name,
              method: test_name,
              runnable: runnable
            }
          end
          file_tests.sort_by! { |t| t[:line_number] }
          file_tests.each do |t|
            t[:id] = "#{t[:file_path]}[#{t[:line_number]}]"
          end
          tests.concat(file_tests)
        end
        tests
      end
    end
  end
end
