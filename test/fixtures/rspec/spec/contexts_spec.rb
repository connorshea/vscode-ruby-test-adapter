# frozen_string_literal: true

require 'test_helper'

describe 'Contexts' do
  context 'when' do
    context 'there' do
      context 'are' do
        context 'many' do
          context 'levels' do
            context 'of' do
              context 'nested' do
                context 'contexts' do
                  it "doesn't break the extension" do
                    expect('Hello text explorer!').to be_a(string)
                  end
                end
              end
            end
          end
        end

        context 'fewer levels of nested contexts' do
          it "still doesn't break the extension" do
            expect('Hello again text explorer!').to be_a(string)
          end
        end
      end
    end
  end
end
