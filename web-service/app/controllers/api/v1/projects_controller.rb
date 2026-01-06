# frozen_string_literal: true

module Api
  module V1
    class ProjectsController < BaseController
      before_action :set_project, only: %i[show update destroy]

      # GET /api/v1/projects
      def index
        @projects = current_user.projects.recent.includes(:tracks)

        render json: {
          projects: @projects.map { |p| project_json(p) }
        }
      end

      # GET /api/v1/projects/:id
      def show
        render json: { project: project_json(@project, include_tracks: true) }
      end

      # POST /api/v1/projects
      def create
        @project = current_user.projects.build(project_params)

        if @project.save
          render json: { project: project_json(@project) }, status: :created
        else
          render json: { errors: @project.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/projects/:id
      def update
        if @project.update(project_params)
          render json: { project: project_json(@project) }
        else
          render json: { errors: @project.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:id
      def destroy
        @project.destroy
        head :no_content
      end



      private

      def set_project
        @project = current_user.projects.find(params[:id])
      end

      def project_params
        params.require(:project).permit(:title, :bpm, global_settings: {})
      end

      def project_json(project, include_tracks: false)
        json = {
          id: project.id,
          title: project.title,
          bpm: project.bpm,
          global_settings: project.global_settings,
          track_count: project.tracks.count,
          created_at: project.created_at,
          updated_at: project.updated_at
        }

        if include_tracks
          json[:tracks] = project.tracks.by_pad_order.map { |t| track_json(t) }
        end

        json
      end

      def track_json(track)
        {
          id: track.id,
          pad_index: track.pad_index,
          source_type: track.source_type,
          settings: track.settings,
          audio_url: track.audio_url,
          prompt_history: track.prompt_history
        }
      end
    end
  end
end
