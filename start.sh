#!/bin/bash
# Start API server on port 8080 in background
PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Start frontend on port 5000
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/nexus-engine run dev

# If frontend exits, kill API server
kill $API_PID 2>/dev/null
