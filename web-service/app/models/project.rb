# frozen_string_literal: true

# Project represents a looper session containing multiple tracks
# Each project has 16 available pad slots (0-15)
class Project < ApplicationRecord
  belongs_to :user
  has_many :tracks, dependent: :destroy

  validates :title, presence: true, length: { maximum: 255 }
  validates :bpm, numericality: { in: 20..300 }, allow_nil: true

  # Default BPM if not specified
  attribute :bpm, :integer, default: 120

  # JSONB settings for global effects
  # Schema: { reverb: float, swing: float, master_volume: float }
  attribute :global_settings, :json, default: -> { default_settings }

  scope :recent, -> { order(updated_at: :desc) }
  scope :by_user, ->(user) { where(user: user) }

  def self.default_settings
    {
      reverb: 0.0,
      swing: 0.0,
      master_volume: 1.0
    }.freeze
  end

  # Ensure we never have more than 16 tracks
  def can_add_track?
    tracks.count < 16
  end

  def next_available_pad_index
    used_indices = tracks.pluck(:pad_index)
    (0..15).find { |i| !used_indices.include?(i) }
  end
end
