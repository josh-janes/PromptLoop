# frozen_string_literal: true

# JWT encoding/decoding service for authentication
class JwtService
  SECRET_KEY = ENV.fetch("JWT_SECRET_KEY") { Rails.application.credentials.secret_key_base }
  ALGORITHM = "HS256"
  EXPIRATION = 24.hours

  class << self
    # Encode a payload into a JWT token
    # @param payload [Hash] The data to encode
    # @return [String] The JWT token
    def encode(payload)
      payload = payload.dup
      payload[:exp] = EXPIRATION.from_now.to_i
      payload[:iat] = Time.current.to_i

      JWT.encode(payload, SECRET_KEY, ALGORITHM)
    end

    # Decode a JWT token
    # @param token [String] The JWT token to decode
    # @return [HashWithIndifferentAccess] The decoded payload
    # @raise [JWT::DecodeError] If the token is invalid
    def decode(token)
      decoded = JWT.decode(token, SECRET_KEY, true, algorithm: ALGORITHM)
      HashWithIndifferentAccess.new(decoded.first)
    end
  end
end
