require "bundler/setup"
require "minitest/autorun"

class Meme
  def i_can_has_cheezburger?
    "OHAI!"
  end

  def will_it_blend?
    "yes"
  end
end

describe Meme do
  before do
    @meme = Meme.new
  end

  it "must respond positively" do
    _(@meme.i_can_has_cheezburger?).must_equal "OHAI!"
  end

  it "won't say no" do
    _(@meme.will_it_blend?).wont_match(/^no/i)
  end
end
