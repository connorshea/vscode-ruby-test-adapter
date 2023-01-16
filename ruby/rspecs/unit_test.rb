require 'rspec'

class Square
  def square_of(n)
    n * n
  end
end

describe Square do
  before do
    @calculator = Square.new
  end

  it "finds the square of 2" do
    expect(@calculator.square_of(2)).to eq(4)
  end

  it "finds the square of 3" do
    expect(@calculator.square_of(3)).to eq(9)
  end
end