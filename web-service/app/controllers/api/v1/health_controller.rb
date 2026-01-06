# frozen_string_literal: true

module Api
  module V1
    class HealthController < ActionController::API
      # GET /api/v1/health
      # No authentication required - used by load balancers
      def show
        render json: {
          status: "ok",
          timestamp: Time.current.iso8601,
          version: LiveGuitar::VERSION,
          database: database_connected?,
          redis: redis_connected?
        }
      end

      private

      def database_connected?
        ActiveRecord::Base.connection.active?
      rescue StandardError
        false
      end

      def redis_connected?
        Sidekiq.redis { |conn| conn.ping == "PONG" }
      rescue StandardError
        false
      end
    end
  end
end
