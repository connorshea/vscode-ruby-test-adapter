require "bundler/setup"
require "minitest/autorun"

class NestMeme
  def i_can_has_cheezburger?
    "OHAI!"
  end

  def will_it_blend?
    "yes"
  end
end

describe NestMeme do
  before do
    @meme = NestMeme.new
  end

  describe "when asked about cheeseburgers" do
    it "must respond positively" do
      _(@meme.i_can_has_cheezburger?).must_equal "OHAI!"
    end
  end

  describe "when asked about blending possibilities" do
    it "won't say no" do
      _(@meme.will_it_blend?).wont_match(/^no/i)
    end
  end
end
