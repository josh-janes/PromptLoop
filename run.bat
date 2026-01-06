@echo off
REM PromptLoop - Windows Run Script
REM Usage: run.bat [dev|prod]

set MODE=%1
if "%MODE%"=="" set MODE=prod

echo 🎸 PromptLoop - Starting in %MODE% mode...

if "%MODE%"=="dev" (
    echo Starting development environment...
    docker compose up --build
) else if "%MODE%"=="prod" (
    echo Starting production environment...
    echo Building all-in-one container...
    docker compose -f docker-compose.prod.yml up --build
) else (
    echo Usage: run.bat [dev^|prod]
    echo   dev  - Start with hot reload and separate services
    echo   prod - Start all-in-one production container
    exit /b 1
)
