require "test_helper"

describe Abs do
  it "finds the absolute value of 1" do
    expect(Abs.new.apply(1)).to eq(1)
  end

  it "finds the absolute value of 0" do
    expect(Abs.new.apply(0)).to eq(0)
  end

  it "finds the absolute value of -1" do
    skip
    expect(Abs.new.apply(-1)).to eq(1)
  end
end

