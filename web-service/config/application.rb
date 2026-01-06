# frozen_string_literal: true

require_relative "boot"

require "rails"
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_mailer/railtie"
require "action_view/railtie"
require "active_storage/engine"

Bundler.require(*Rails.groups)

module PromptLoop
  class Application < Rails::Application
    config.load_defaults 7.1

    # API-only mode
    config.api_only = true

    # Time zone
    config.time_zone = "UTC"

    # Generators
    config.generators do |g|
      g.test_framework :rspec
      g.fixture_replacement :factory_bot, dir: "spec/factories"
    end

    # CORS configuration handled in initializer
  end
end
