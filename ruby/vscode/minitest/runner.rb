module VSCode
  module Minitest
    class Runner
      attr_reader :reporter, :runnables

      def initialize(reporter:)
        @reporter = reporter
        @runnables = []
      end

      def add(runnable)
        path, line = runnable.split(":")
        path = File.expand_path(path, VSCode.project_root)
        return add_dir(path) if File.directory?(path)
        return add_file_with_line(path, line.to_i) if File.file?(path) && line
        return add_file(path) if File.file?(path)
        raise "Can't add #{runnable.inspect}"
      end

      def add_dir(path)
        patterns = ENV.fetch('TESTS_PATTERN').split(',').map { |p| "#{path}/**/#{p}" }
        Rake::FileList[*patterns].each do |file|
          add_file(file)
        end
      end

      def add_file(file)
        test = VSCode::Minitest.tests.find_by(full_path: file)
        runnables << [test[:runnable], {}] if test
      end

      def add_file_with_line(file, line)
        test = VSCode::Minitest.tests.find_by(full_path: file, line_number: line)
        raise "There is no test the the given location: #{file}:#{line}" unless test
        runnables << [test[:runnable], filter: test[:method]]
      end

      def run
        runnables.each do |runnable, options|
          runnable.run(reporter, options)
        end
      end
    end
  end
end
