# This is a comment that acts as documentation when running `just --list`
default:
    @just --list

# serve on nohup `just serve`
serve:
    nohup node dist/cli/index.js serve --port 7171 --host 127.0.0.1 --quiet > /dev/null 2>&1 &

# full build
build:
    bun run build

# run repoos check
check:
    repoos check

# list tasks
list:
    repoos list

# stop the background server
kill:
    pkill -f "node.*dist/cli/index.js.*serve" || true

# restart: kill then serve
restart: kill serve

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
