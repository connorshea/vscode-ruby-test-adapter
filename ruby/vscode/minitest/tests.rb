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
        $LOAD_PATH << VSCode.project_root.join("test").to_s
        Rake::FileList["test/**/*_test.rb"].each { |path| require File.expand_path(path) }
      end

      def build_list
        tests = []
        ::Minitest::Runnable.runnables.map do |runnable|
          file_tests = runnable.runnable_methods.map do |test_name|
            path, line = runnable.instance_method(test_name).source_location
            full_path = File.expand_path(path, VSCode.project_root)
            path = full_path.gsub(VSCode.project_root.to_s, ".")
            path = "./#{path}" unless path =~ /^\./
            {
              description: test_name.gsub(/^test_/, "").gsub("_", " "), full_description: test_name.gsub(/^test_/, "").gsub("_", " "),
              file_path: path, full_path: full_path, line_number: line, klass: runnable.name, method: test_name
            }
          end
          file_tests.sort_by! { |t| t[:line_number] }
          file_tests.each_with_index do |t, index|
            t[:id]= "#{t[:file_path]}[1:1:#{index + 1}]"
          end
          tests.concat(file_tests)
        end
        tests
      end
    end
  end
end
