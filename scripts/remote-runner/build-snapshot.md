# Building the Remote Validation Runner snapshot (one-time)

The runner boots a Hetzner server from a **snapshot** that already has Docker and
the `repoos-ci` image on it, so a cold job pays ~40–60 s of boot, not a
multi-minute image build. Rebuild the snapshot whenever `Dockerfile.ci`, the
base image, or `validate.sh` changes.

## Prerequisites

- A Hetzner Cloud project + API token (`HETZNER_API_TOKEN`).
- An SSH key registered in that project. Note its **name** — that is
  `remoteValidation.sshKeyName`. The matching private key path is
  `REPOOS_REMOTE_SSH_KEY` on the RepoOS host.
- `hcloud` CLI (`brew install hcloud`) authenticated to the project.

## Steps

**Architecture matters.** A Hetzner snapshot only boots on the same CPU
architecture it was built on. Build the snapshot on the SAME family you will run
the runner as:

| Runner type (`remoteValidation.serverType`) | Arch | Builder `--type` |
| --- | --- | --- |
| `cax31` (8 vCPU Ampere, 16 GB) — cheapest, recommended | arm64 | `cax11` |
| `cpx41` (8 vCPU AMD, 16 GB) | x86-64 | `cx22` |

This repo has **zero native runtime dependencies** (sqlite is a bun/node
builtin), so arm64 is safe and ~half the price.

```bash
cd scripts/remote-runner

# 1. Boot a throwaway builder — MATCH the arch of your intended runner (see table above).
hcloud server create \
  --name repoos-ci-builder \
  --type cax11 \
  --location hil \
  --image ubuntu-24.04 \
  --ssh-key "<your-key-name>" \
  --user-data-from-file cloud-init.yaml
IP=$(hcloud server ip repoos-ci-builder)

# 2. Wait for cloud-init, then push the CI build context + validate.sh.
ssh root@"$IP" 'cloud-init status --wait'
scp Dockerfile.ci validate.sh root@"$IP":/opt/repoos/
ssh root@"$IP" 'chmod 755 /opt/repoos/validate.sh'

# 3. Build and sanity-check the image on the box.
ssh root@"$IP" 'cd /opt/repoos && docker build -f Dockerfile.ci -t repoos-ci .'
ssh root@"$IP" 'docker run --rm --user 0:0 repoos-ci "bun --version && node --version && git --version"'

# 4. Power off and snapshot.
hcloud server shutdown repoos-ci-builder && sleep 20
hcloud server create-image \
  --type snapshot \
  --description "repoos-ci $(date -u +%Y-%m-%d)" \
  repoos-ci-builder
# → prints the snapshot ID

# 5. Delete the builder.
hcloud server delete repoos-ci-builder
```

## Wire it up

In `repoos.toml`:

```toml
[remoteValidation]
enabled = true
serverType = "cax31"          # 8 vCPU Ampere / 16 GB (arm64 snapshot). Use "cpx41" for an x86 snapshot.
location = "hil"
snapshotId = "123456789"      # from step 4
sshKeyName = "your-key-name"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
```

Secrets go in `.env` (never `repoos.toml`):

```
HETZNER_API_TOKEN=...
REPOOS_REMOTE_SSH_KEY=/Users/you/.ssh/repoos_ci_ed25519
```

Restart the server. On boot RepoOS runs `reconcile()` (deletes any leaked
`repoos-ci=1` server) and the next `review → done` runs the gate remotely.
