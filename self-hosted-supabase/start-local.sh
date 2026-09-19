#!/bin/bash
set -e

echo "================================================================="
echo "   Presences-AI: Starting Local Self-Hosted Supabase Stack"
echo "================================================================="

if [ ! -f .env ]; then
    echo "[.env file not found, copying from .env.example...]"
    cp .env.example .env
fi

docker compose up -d

echo "================================================================="
echo "   Supabase is running!"
echo "   • API URL:    http://localhost:8000"
echo "   • Studio UI:  http://localhost:3001"
echo "================================================================="
