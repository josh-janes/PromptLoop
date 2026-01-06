# frozen_string_literal: true

class CreateTracks < ActiveRecord::Migration[7.1]
  def change
    create_table :tracks do |t|
      t.references :project, null: false, foreign_key: true
      t.integer :pad_index, null: false
      t.string :source_type, null: false
      t.jsonb :settings, default: {}
      t.jsonb :prompt_history, default: {}

      t.timestamps
    end

    # Ensure unique pad_index per project
    add_index :tracks, [:project_id, :pad_index], unique: true
    add_index :tracks, :source_type
  end
end
