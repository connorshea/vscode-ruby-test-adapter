class Abs
  def apply(n)
    case
    when n > 0
      n
    when n == 0
      raise "Abs for zero is not supported"
    end
  end
end
