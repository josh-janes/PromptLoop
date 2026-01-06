# frozen_string_literal: true

Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :projects do
        resources :tracks, shallow: true
        

      end
      
      # Health check for load balancers
      get :health, to: "health#show"
    end
  end
end
