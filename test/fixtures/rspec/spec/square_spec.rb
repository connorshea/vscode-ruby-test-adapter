require "test_helper"

describe Square do
  it "finds the square of 2" do
    expect(Square.new.apply(2)).to eq(4)
  end

  it "finds the square of 3" do
    expect(Square.new.apply(3)).to eq(9)
  end
end

