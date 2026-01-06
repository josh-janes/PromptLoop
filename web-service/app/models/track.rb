# frozen_string_literal: true

# Track represents a single audio loop on one of the 16 pads
# Tracks can be recordings, uploads, or AI-generated
class Track < ApplicationRecord
  belongs_to :project
  has_one_attached :audio_file

  # Source type enum: how the audio was created
  enum :source_type, {
    upload: "upload",
    recording: "recording",
    ai_generation: "ai_generation"
  }, prefix: true

  validates :pad_index, presence: true,
                        numericality: { in: 0..15, only_integer: true },
                        uniqueness: { scope: :project_id, message: "is already used in this project" }
  validates :source_type, presence: true

  # JSONB for AI generation metadata
  # Schema: { prompt: string, model: string, generated_at: timestamp }
  attribute :prompt_history, :json, default: -> { {} }

  # Track-specific settings
  # Schema: { volume: float, pan: float, muted: bool, solo: bool }
  attribute :settings, :json, default: -> { default_settings }

  scope :by_pad_order, -> { order(:pad_index) }
  scope :ai_generated, -> { where(source_type: :ai_generation) }

  def self.default_settings
    {
      volume: 1.0,
      pan: 0.0,
      muted: false,
      solo: false
    }.freeze
  end

  # Convenience method for checking if this track was AI-generated
  def ai_generated?
    source_type_ai_generation?
  end

  # Get the audio URL for streaming
  def audio_url
    return nil unless audio_file.attached?

    Rails.application.routes.url_helpers.rails_blob_url(audio_file, only_path: true)
  end
end
