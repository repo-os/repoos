# This is a comment that acts as documentation when running `just --list`
default:
    @just --list

# serve on nohup `just serve`
serve:
    nohup node dist/cli/index.js serve --port 7171 --host 127.0.0.1 --quiet > .repoos/logs/server.out 2>&1 < /dev/null &

# full build `bun run build`
build:
    bun run build

# stage and commit all current changes: `just commit "Describe the change"`
commit message:
    git add . && git commit -m {{quote(message)}}

# run repoos check
check:
    repoos check

# list tasks `repoos list`
list:
    repoos list

# stop the background server
kill:
    pkill -f "node.*dist/cli/index.js.*serve" || true

# restart: build then kill then serve
restart: build kill serve

# show the server-out log
wtf:
    tail .repoos/logs/server.out

# tail system logs
log:
    tail -f .repoos/logs/system.log

# tail a task's logs `just log-task 0187`
log-task id:
    tail -f .repoos/logs/tasks/{{id}}.log

# tail an agent's logs `just log-agent tech-debt`
log-agent id:
    tail -f .repoos/logs/agents/{{id}}.log

# curl the system logs API endpoint
api-log:
    curl -s http://127.0.0.1:7171/api/system/logs | jq '.logs[:20]'

# curl logs for a task `just api-log-task 0187`
api-log-task id:
    curl -s http://127.0.0.1:7171/api/tasks/{{id}}/logs | jq '.logs[:20]'

# dev HMR UI
dev:
    bunx vite --config src/ui-app/vite.config.ts

# plain git status
git-status:
    git status

# health check: is 7171 alive, is main dirty, are multiple servers conflicting
status:
    #!/usr/bin/env bash
    set -uo pipefail

    echo "== port 7171 =="
    pids=$(lsof -nP -iTCP:7171 -sTCP:LISTEN -t 2>/dev/null)
    if [ -z "$pids" ]; then
        echo "  nothing listening on 7171"
    else
        count=$(echo "$pids" | wc -l | tr -d ' ')
        if [ "$count" -gt 1 ]; then
            echo "  CONFLICT: $count processes listening on 7171"
        else
            echo "  1 process listening on 7171"
        fi
        lsof -nP -iTCP:7171 -sTCP:LISTEN
    fi

    echo
    echo "== http check =="
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:7171/api/system/logs 2>/dev/null)
    if [ "$code" = "200" ]; then
        echo "  alive: http://127.0.0.1:7171 responded 200"
    else
        echo "  not responding (got: ${code:-none})"
    fi

    echo
    echo "== other node/repoos server processes =="
    pgrep -fl "node.*dist/cli/index.js.*serve" || echo "  none found via pgrep"

    echo
    echo "== git =="
    branch=$(git branch --show-current)
    echo "  branch: $branch"
    if [ -n "$(git status --porcelain)" ]; then
        echo "  dirty: yes"
        git status --short
    else
        echo "  dirty: no"
    fi
