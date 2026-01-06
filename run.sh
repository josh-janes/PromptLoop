#!/bin/bash
# PromptLoop - Run Script
# Usage: ./run.sh [dev|prod]

set -e

MODE=${1:-prod}

echo "🎸 PromptLoop - Starting in $MODE mode..."

if [ "$MODE" = "dev" ]; then
    echo "Starting development environment..."
    docker compose up --build
elif [ "$MODE" = "prod" ]; then
    echo "Starting production environment..."
    echo "Building all-in-one container..."
    docker compose -f docker-compose.prod.yml up --build
else
    echo "Usage: ./run.sh [dev|prod]"
    echo "  dev  - Start with hot reload and separate services"
    echo "  prod - Start all-in-one production container"
    exit 1
fi
