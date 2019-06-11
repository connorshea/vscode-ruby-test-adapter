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
        Rake::FileList["#{path}/**/*_test.rb"].each do |file|
          add_file(file)
        end
      end

      def add_file(file)
        test = VSCode::Minitest.tests.find_by(full_path: file)
        runnables << [constant_for(test[:klass]), {}] if test
      end

      def add_file_with_line(file, line)
        test = VSCode::Minitest.tests.find_by(full_path: file, line_number: line)
        raise "There is no test the the given location: #{file}:#{line}" unless test
        runnables << [constant_for(test[:klass]), filter: test[:method]]
      end

      def run
        runnables.each do |runnable, options|
          runnable.run(reporter, options)
        end
      end

      private

      def constant_for(str)
        names = str.split("::".freeze)

        # Trigger a built-in NameError exception including the ill-formed constant in the message.
        Object.const_get(str) if names.empty?

        # Remove the first blank element in case of '::ClassName' notation.
        names.shift if names.size > 1 && names.first.empty?

        names.inject(Object) do |constant, name|
          if constant == Object
            constant.const_get(name)
          else
            candidate = constant.const_get(name)
            next candidate if constant.const_defined?(name, false)
            next candidate unless Object.const_defined?(name)

            # Go down the ancestors to check if it is owned directly. The check
            # stops when we reach Object or the end of ancestors tree.
            constant = constant.ancestors.inject(constant) do |const, ancestor|
              break const    if ancestor == Object
              break ancestor if ancestor.const_defined?(name, false)
              const
            end

            # owner is in Object, so raise
            constant.const_get(name, false)
          end
        end
      end
    end
  end
end
