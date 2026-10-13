---
layout: post
author: "Robertito"
title: "The container runs as root, but cannot write"
categories: ops
tags: [software, docker, linux, ops, security]
permalink: /general/2026/10/13/the-container-runs-as-root-but-cannot-write.html
description: "A root sidecar, an owner-only bind mount and dropped capabilities: why Docker permissions failed, and why the fix was less privilege, not more."
excerpt: "A root sidecar, an owner-only bind mount and dropped capabilities: why Docker permissions failed, and why the fix was less privilege, not more."
---

The container was running as root. The state directory existed. The daemon still reported:

```text
open /var/lib/tailscale/tailscaled.state: permission denied
```

That was the failure during a console rollout for [Fulano](https://web.fulano.apps.1ma.dev/), Juanma's personal AI assistant service. A Tailscale sidecar could not persist its identity. It fell back to an in-memory store and remained unhealthy.

The tempting fix was to loosen the directory permissions. The useful fix was to stop treating “root” as a complete description of a process.

<!--more-->

## Root is an identity, not a permission slip

The relevant deployment facts were:

- the sidecar started as UID 0;
- its configuration dropped all Linux capabilities;
- its root filesystem was read-only;
- a writable bind mount supplied its state directory;
- that directory belonged to the host deployment user and had mode `0700`.

Linux separates superuser privileges into capabilities. `CAP_DAC_OVERRIDE` is the one that bypasses ordinary file read, write and execute permission checks. Without that capability, UID 0 does not automatically bypass the permissions on somebody else's directory.[^capabilities] Docker lets a container drop capabilities, including all of them.[^docker]

The hardened container was doing what we asked. Our ownership arrangement was wrong.

I reproduced the kernel behavior separately in a throwaway Linux directory owned by UID 10001, mode `0700`. With all capabilities dropped, the results were:

```text
UID 0      -> permission denied
UID 10001  -> file created
```

The effective capability mask was zero in both cases. The number 10001 was chosen for this demonstration, not copied from production. This was a Linux permissions test, not a replay of the complete Docker deployment.

## Inspect the mount, not the image

A bind mount exposes the host path inside the container. It also obscures whatever the image already contained at that destination.[^mounts] A Dockerfile that sets ownership on an image directory therefore does not settle ownership of the host directory mounted over it.

These are useful starting checks, with names adapted to your deployment:

{% raw %}
```bash
docker inspect sidecar --format '{{json .HostConfig.CapDrop}}'
docker inspect sidecar --format '{{json .Mounts}}'
docker exec sidecar sh -c 'id; grep "^CapEff:" /proc/self/status'

# On the Docker host, using GNU stat:
stat -c '%u:%g %a %n' /path/to/state
```
{% endraw %}

The exec command checks the new shell. If the entrypoint changes credentials, inspect the daemon's actual process too.

Also distinguish a read-only container root from a read-only state mount. In this incident, the state mount was writable; ownership blocked access. Making the mount writable again would have fixed nothing.

The correction ran the sidecar as the deployment user's UID/GID, derived during installation, while retaining `0700` and dropped capabilities. Relevant lines looked like this; this is not a complete Compose file:

```yaml
user: "${TAILSCALE_UID}:${TAILSCALE_GID}"
cap_drop: [ALL]
read_only: true
volumes:
  - ./tailscale-state:/var/lib/tailscale
```

Do not apply that numeric-ID recipe blindly to rootless or user-namespace-remapped Docker. Translate through the host/container mapping and arrange host ownership accordingly.[^userns]

## The daemon worked; the CLI used another door

The read-only root exposed a second assumption. The pinned Tailscale image created its socket at `/tmp/tailscaled.sock`, then failed to create a compatibility symlink beneath `/var/run/tailscale`.

Setting the daemon's socket location was not enough. The plain CLI still looked under `/var/run`. The follow-up patch passed the real socket explicitly to status checks and lifecycle commands:

```bash
tailscale --socket=/tmp/tailscaled.sock status
```

This was not another ownership failure. It was two processes disagreeing about a pathname.

Separately, the installer rejected symlinked state and configuration paths before mutation. That was defensive hardening, not the cause of the original write denial. Socket compatibility links and durable-state path validation are different problems; blaming “symlinks” generally would hide both.

## A permission check that measured the filesystem

The installer also had an apparently portable mode check:

```bash
mode="$(stat -f '%Lp' "$path" 2>/dev/null || stat -c '%a' "$path")"
```

On GNU/Linux, `stat -f` requests filesystem information, not BSD-style file-mode formatting.[^stat] In a local reproduction, the first command emitted filesystem statistics before failing, then the fallback appended `600`. Silencing stderr did not remove the earlier stdout.

A valid private file was rejected because the captured value was not just `600`.

The fix tried GNU formatting first and assigned the BSD fallback separately. Regression checks accepted `0600` and rejected `0644`. “The command ran” and “the command returned the property I needed” are different tests.

## Rollback needs its own failure boundary

The old failure handler combined rollback with deletion of its staging directory. An error inside rollback re-entered the error trap, and cleanup removed a helper still needed for restoration. The next failure was a missing bind-mount source.

Now the recovery path was broken too.

The correction cleared error and signal traps before entering rollback and delayed staging cleanup until restoration returned. Bash's error-trap inheritance depends on context and settings such as `errtrace`; `set -e` is not a transaction manager.[^bash]

My rule for recovery code: if restoration is incomplete, preserve the material needed to finish it. Cleanup is not success.

## The useful acceptance test

The recorded fixes were checked against the pinned image: it wrote durable state as the deployment owner, and the explicit CLI socket worked. Later canary checks covered forced container recreation and service availability afterward. I did not rerun production for this article; I reviewed the retained evidence and reproduced the smaller Linux and `stat` failures locally.

For the next sidecar, my checklist is short:

1. Verify the daemon's identity and capabilities.
2. Check host ownership, mount flags and the actual destination.
3. Make the writable-state contract explicit.
4. Exercise the real CLI and restart path.
5. Inject a failure into rollback, not just startup.

Do not solve a mismatched owner by giving every process more power.

The least-privileged fix was not a more powerful root. It was the right user.

[^capabilities]: Linux manual, [capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html), especially `CAP_DAC_OVERRIDE`.
[^docker]: Docker documentation, [Running containers](https://docs.docker.com/engine/containers/run/), runtime privilege and capabilities.
[^mounts]: Docker documentation, [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/).
[^userns]: Docker documentation, [User namespace remapping](https://docs.docker.com/engine/security/userns-remap/).
[^stat]: GNU Coreutils manual, [stat invocation](https://www.gnu.org/software/coreutils/manual/html_node/stat-invocation.html).
[^bash]: GNU Bash manual, [The Set Builtin](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html), `errtrace`.
