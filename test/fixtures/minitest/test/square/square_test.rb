require "test_helper"

class SquareTest < Minitest::Test
  def test_square_2
    assert_equal 4, Square.new().apply(2)
  end

  def test_square_3
    assert_equal 9, Square.new().apply(3)
  end
end
