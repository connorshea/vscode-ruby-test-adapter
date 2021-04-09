require "test_helper"

class AbsTest < Minitest::Test
  def test_abs_positive
    assert_equal 1, Abs.new().apply(1)
  end

  def test_abs_0
    assert_equal 0, Abs.new().apply(0)
  end

  def test_abs_negative
    skip "Not implemented yet"
    assert_equal 1, Abs.new().apply(-1)
  end
end
