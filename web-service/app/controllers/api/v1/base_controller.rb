# frozen_string_literal: true

# Base controller for all API endpoints
# Provides common authentication and error handling
module Api
  module V1
    class BaseController < ActionController::API
      include ActionController::MimeResponds

      before_action :authenticate_request

      rescue_from ActiveRecord::RecordNotFound, with: :not_found
      rescue_from ActiveRecord::RecordInvalid, with: :unprocessable_entity
      rescue_from ActionController::ParameterMissing, with: :bad_request

      private

      # JWT-based authentication
      def authenticate_request
        header = request.headers["Authorization"]
        token = header&.split(" ")&.last

        if token.blank?
          render json: { error: "Missing authorization token" }, status: :unauthorized
          return
        end

        begin
          decoded = JwtService.decode(token)
          @current_user = User.find(decoded[:user_id])
        rescue JWT::DecodeError, ActiveRecord::RecordNotFound
          render json: { error: "Invalid or expired token" }, status: :unauthorized
        end
      end

      def current_user
        @current_user
      end

      def not_found(exception)
        render json: { error: exception.message }, status: :not_found
      end

      def unprocessable_entity(exception)
        render json: { error: exception.record.errors.full_messages }, status: :unprocessable_entity
      end

      def bad_request(exception)
        render json: { error: exception.message }, status: :bad_request
      end
    end
  end
end
