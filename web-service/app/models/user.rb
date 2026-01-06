# frozen_string_literal: true

# User model for authentication
# Uses has_secure_password for bcrypt-based authentication
class User < ApplicationRecord
  has_secure_password

  has_many :projects, dependent: :destroy
  has_many :tracks, through: :projects

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 8 }, if: -> { new_record? || password.present? }

  before_save :downcase_email

  private

  def downcase_email
    self.email = email.downcase
  end
end
