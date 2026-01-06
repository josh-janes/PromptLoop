# frozen_string_literal: true

module Api
  module V1
    class TracksController < BaseController
      before_action :set_track, only: %i[show update destroy]
      before_action :set_project, only: %i[index create]

      # GET /api/v1/projects/:project_id/tracks
      def index
        @tracks = @project.tracks.by_pad_order

        render json: {
          tracks: @tracks.map { |t| track_json(t) }
        }
      end

      # GET /api/v1/tracks/:id
      def show
        render json: { track: track_json(@track) }
      end

      # POST /api/v1/projects/:project_id/tracks
      # Used for uploading or recording new tracks
      def create
        unless @project.can_add_track?
          render json: { error: "Project has reached maximum of 16 tracks" }, status: :unprocessable_entity
          return
        end

        @track = @project.tracks.build(track_params)
        @track.pad_index ||= @project.next_available_pad_index

        if @track.save
          render json: { track: track_json(@track) }, status: :created
        else
          render json: { errors: @track.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/tracks/:id
      def update
        if @track.update(track_params)
          render json: { track: track_json(@track) }
        else
          render json: { errors: @track.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/tracks/:id
      def destroy
        @track.destroy
        head :no_content
      end

      private

      def set_track
        @track = Track.joins(project: :user)
                      .where(projects: { user_id: current_user.id })
                      .find(params[:id])
      end

      def set_project
        @project = current_user.projects.find(params[:project_id])
      end

      def track_params
        params.require(:track).permit(
          :pad_index,
          :source_type,
          :audio_file,
          settings: {}
        )
      end

      def track_json(track)
        {
          id: track.id,
          pad_index: track.pad_index,
          source_type: track.source_type,
          settings: track.settings,
          audio_url: track.audio_url,
          prompt_history: track.prompt_history,
          created_at: track.created_at
        }
      end
    end
  end
end
