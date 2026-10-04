# Shared pretty-printing helpers for justfile recipes. Source, don't execute:
#   source scripts/just-ui.sh
# Colors are off when stdout isn't a TTY or NO_COLOR is set.

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    _b=$'\033[1m'; _d=$'\033[2m'; _r=$'\033[0m'
    _red=$'\033[31m'; _grn=$'\033[32m'; _ylw=$'\033[33m'; _blu=$'\033[34m'; _cyn=$'\033[36m'
else
    _b=; _d=; _r=; _red=; _grn=; _ylw=; _blu=; _cyn=
fi

# section "title"        — bold cyan heading with a rule
section() { printf '\n%s%s▍ %s%s\n' "$_b" "$_cyn" "$1" "$_r"; }
# step 2 4 "message"     — numbered progress step
step() { printf '%s%s[%s/%s]%s %s%s%s\n' "$_b" "$_blu" "$1" "$2" "$_r" "$_b" "$3" "$_r"; }
ok()   { printf '  %s✔%s %s\n' "$_grn" "$_r" "$1"; }
warn() { printf '  %s▲%s %s\n' "$_ylw" "$_r" "$1"; }
fail() { printf '  %s✖ %s%s\n' "$_red" "$1" "$_r" >&2; }
note() { printf '  %s%s%s\n' "$_d" "$1" "$_r"; }
# kv label value        — aligned label/value row
kv()   { printf '  %s%-10s%s %s\n' "$_d" "$1" "$_r" "$2"; }
# indent_dim            — pipe command output through to show it dimmed + indented
indent_dim() { while IFS= read -r line; do printf '  %s%s%s\n' "$_d" "$line" "$_r"; done; }
