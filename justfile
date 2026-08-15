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
