# This is a comment that acts as documentation when running `just --list`
default:
    @just --list

# serve on nohup `just serve` (runs under Bun if present; REPOOS_RUNTIME=node to force Node)
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

# format code with oxfmt (TS/Vue/CSS; .oxfmtrc scopes it) `just fmt`
fmt:
    bun run fmt

# check formatting without writing `just fmt-check`
fmt-check:
    bun run fmt:check

# run the test suite under Bun (~5x faster) `just test` / `just test runtime`
test *args:
    bun run --bun test -- {{args}}

# run the test suite under Node (the pre-Bun path) `just test-node`
test-node *args:
    bun run test -- {{args}}

# open the sqlite db, or run one query: `just db` / `just db "select * from sessions limit 5"`
db *args:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v sqlite3 >/dev/null; then
        echo "error: sqlite3 CLI not found — brew install sqlite (the app itself uses bun:/node:sqlite, not this binary)" >&2
        exit 1
    fi
    if [ -z "{{args}}" ]; then
        exec sqlite3 -header -column .repoos/repoos.db
    else
        exec sqlite3 -header -column .repoos/repoos.db "{{args}}"
    fi

# per-model token/cache/cost rollup from the sessions table `just db-usage`
db-usage:
    #!/usr/bin/env bash
    set -euo pipefail
    sqlite3 -header -column .repoos/repoos.db "
      SELECT codingAgent, model, COUNT(*) n,
             SUM(COALESCE(inputTokens,0))          AS input,
             SUM(COALESCE(cacheReadTokens,0))      AS cache_read,
             SUM(COALESCE(cacheCreationTokens,0))  AS cache_write,
             SUM(COALESCE(turns,0))                AS turns,
             ROUND(SUM(COALESCE(costUsd,0)),4)     AS cost_usd,
             ROUND(100.0*SUM(COALESCE(cacheReadTokens,0)) /
                   NULLIF(SUM(COALESCE(inputTokens,0))+SUM(COALESCE(cacheReadTokens,0)),0),1) AS cache_pct
      FROM sessions GROUP BY codingAgent, model ORDER BY n DESC;"

# raw per-event usage ground truth, most recent first `just db-usage-raw [sessionId]`
db-usage-raw *sessionId:
    #!/usr/bin/env bash
    set -euo pipefail
    where=""
    [ -n "{{sessionId}}" ] && where="WHERE sessionId = '{{sessionId}}'"
    sqlite3 -header -column .repoos/repoos.db "
      SELECT substr(ts,1,19) ts, substr(sessionId,1,14) session, taskId, eventType,
             inputTokens input, cacheReadTokens cache_read, outputTokens output,
             turns, costUsd cost
      FROM session_usage_events $where ORDER BY id DESC LIMIT 40;"

# list tasks `repoos list`
list:
    repoos list

# stop the background server (matches node or bun — see REPOOS_RUNTIME)
kill:
    pkill -f "dist/cli/index.js serve" || true

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

# build the mobile app's Android debug APK for rapid local testing `just build-android`
build-android:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v brew >/dev/null || [ -z "$(brew --prefix openjdk@21 2>/dev/null)" ]; then
        echo "error: openjdk@21 not found — run: brew install openjdk@21" >&2
        exit 1
    fi
    sdk_root="$(brew --prefix)/share/android-commandlinetools"
    if [ ! -d "$sdk_root" ]; then
        echo "error: Android SDK not found at $sdk_root — run: brew install --cask android-commandlinetools" >&2
        exit 1
    fi
    cd mobile
    bun install
    bun run build
    bun run sync
    cd android
    export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
    export ANDROID_HOME="$sdk_root"
    export ANDROID_SDK_ROOT="$sdk_root"
    ./gradlew assembleDebug
    apk="app/build/outputs/apk/debug/app-debug.apk"
    cp -f "$apk" ../app-debug.apk
    echo "==> mobile/app-debug.apk ($(du -h ../app-debug.apk | cut -f1)) — copied from $apk"

# build the mobile app for the iOS Simulator (unsigned .app, no device/App Store signing) `just build-ios`
build-ios:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! xcodebuild -version >/dev/null 2>&1; then
        echo "error: full Xcode is required (Command Line Tools alone won't build) — install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app" >&2
        exit 1
    fi
    cd mobile
    bun install
    bun run build
    bun run sync
    cd ios/App
    xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug -derivedDataPath ../build build
    app=$(find ../build/Build/Products -maxdepth 1 -iname "*.app" | head -1)
    echo "==> $app (iOS Simulator build — unsigned, not a device-installable .ipa)"

# build both mobile platforms `just build-mobile`
build-mobile: build-android build-ios

# show the released version (package.json) vs the latest git tag
current-version:
    #!/usr/bin/env bash
    set -euo pipefail
    pkg=$(node -p "require('./package.json').version")
    tag=$(git tag --sort=-v:refname | head -1)
    echo "package.json: $pkg"
    echo "latest tag:   ${tag:-none}"
    if [ -n "$tag" ] && [ "v$pkg" != "$tag" ]; then
        echo "note: package.json and latest tag disagree"
    fi

# cut a release: bump version, tag, and push `just release 0.5.31`
release version:
    #!/usr/bin/env bash
    set -euo pipefail

    if [ -n "$(git status --porcelain)" ]; then
        echo "error: working tree is dirty — commit or stash first" >&2
        exit 1
    fi

    branch=$(git branch --show-current)
    if [ "$branch" != "main" ]; then
        echo "error: releases are cut from main (currently on $branch)" >&2
        exit 1
    fi

    version="{{version}}"
    tag="v$version"

    if git rev-parse "$tag" >/dev/null 2>&1; then
        echo "error: tag $tag already exists" >&2
        exit 1
    fi

    echo "==> bumping package.json to $version"
    node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); p.version='$version'; fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');"

    echo "==> running checks"
    bun run build
    repoos check

    echo "==> committing"
    git add package.json
    git commit -m "chore: release $tag"

    echo "==> tagging"
    git tag "$tag"

    echo "==> pushing main and tag"
    git push origin main
    git push origin "$tag"

    echo "==> done: $tag released"
    echo "    GitHub Actions will build dist and attach it to the GitHub Release: https://github.com/repo-os/repoos/actions/workflows/release.yml"

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
    echo "== other repoos server processes =="
    pgrep -fl "dist/cli/index.js serve" || echo "  none found via pgrep"

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
