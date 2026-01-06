# frozen_string_literal: true

class CreateProjects < ActiveRecord::Migration[7.1]
  def change
    create_table :projects do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.integer :bpm, default: 120
      t.jsonb :global_settings, default: {}

      t.timestamps
    end

    add_index :projects, [:user_id, :updated_at]
  end
end
