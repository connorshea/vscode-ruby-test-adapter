$LOAD_PATH.unshift File.expand_path('../../', __dir__)
require "minitest/autorun"
require "tmpdir"
require "pathname"
require "open3"
require "json"

module TestHelper
  def assert_any(collection, count: nil, pass_count: nil, &block)
    assert_equal count, collection.count if count

    good_items = []
    errors = []

    collection.each do |c|
      begin
        block[c]
        good_items << c
      rescue Minitest::Assertion => error
        errors << error
      end
    end

    if good_items.empty?
      raise errors.max_by(&:location)
    else
      assert_equal pass_count, good_items.size, "Expect #{pass_count} items pass the test" if pass_count
    end
  end
end
