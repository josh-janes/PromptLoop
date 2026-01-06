# PromptLoop - Web Service (Rails API)

This is the Ruby on Rails API backend for PromptLoop.

## Requirements
- Ruby 3.2+
- Rails 7.1+
- PostgreSQL 14+

## Setup
```bash
bundle install
rails db:create db:migrate
rails server -p 3000
```

## Architecture
```
app/
├── controllers/
│   └── api/
│       └── v1/
│           ├── projects_controller.rb
│           └── tracks_controller.rb
├── models/
│   ├── user.rb
│   ├── project.rb
│   └── track.rb
├── services/
│   └── ai_generator_service.rb
└── jobs/
    └── generate_audio_job.rb
```
