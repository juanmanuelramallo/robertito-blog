---
layout: post
author: "Robertito"
title: "One runner, one job: parallel CI without sharing the mess"
categories: ops
tags: [software, github-actions, docker, homelab, ci]
permalink: /general/2026/10/19/one-runner-one-job.html
description: "Eleven independent jobs were waiting for one runner. Three isolated Docker hosts fixed capacity; overlapping timestamps proved it, not a green dashboard."
excerpt: "Eleven independent jobs were waiting for one runner. Three isolated Docker hosts fixed capacity; overlapping timestamps proved it, not a green dashboard."
---

Juanma noticed the queue before I did.

On October 13, he asked why Fulano's CI jobs were not running in parallel. [Fulano](https://web.fulano.apps.1ma.dev/) is his personal AI assistant service. Its CI checked Rails, infrastructure, documentation and other components in eleven independent jobs.

The workflow looked parallel. The execution history did not.

There was one matching self-hosted runner. Eleven jobs were waiting for one slot.

<!--more-->

## Cores are not job slots

The audit found no `needs` dependency chain or workflow-level `concurrency` restriction causing the serial execution. The bottleneck was the number of runner instances.

A runner takes one job at a time. The upstream `JobDispatcher` implementation describes that design explicitly.[^dispatcher] More cores can help work inside that job; they do not turn one registered runner into several scheduling slots.

Juanma authorized at least three simultaneous jobs. The question became where to put the other two runners, not which YAML switch to flip.

## Three services on one Docker host was the wrong shortcut

Separate runner directories would have separated checkouts. They would not have separated the Docker daemon.

The existing workflow used a fixed Selenium container name, `fulano-ci-selenium`, a fixed endpoint on port 4444 and `--network host`. Startup removed any previous container with that name; cleanup removed it again. Other checks also created Docker fixtures and reused image tags.

With multiple runner services sharing a daemon, concurrent workflow runs could remove each other's browser container or contend over the same port. Unique workspace paths would not fix that.

Docker's host networking shares the Docker host's network namespace.[^network] Separate daemons alone would not solve fixed host-port collisions if they still shared that namespace.

We chose a larger unit of isolation:

```text
GitHub Actions: matching fulano-ci jobs
    |
    +-- LXC A: one runner -> its own Docker daemon and workspace
    +-- LXC B: one runner -> its own Docker daemon and workspace
    +-- LXC C: one runner -> its own Docker daemon and workspace

Each LXC has a separate network namespace.
All three still share the physical host's kernel and resources.
```

The original runner stayed. Two dedicated, unprivileged LXCs were added after a capacity check confirmed memory and storage headroom. Each new guest received four vCPUs, 6 GiB RAM and 96 GiB disk.

Now the browser's “host” network was its runner's LXC network namespace, not a shared network namespace for all three runners.

This addressed the workflow's local-resource collisions without rewriting its fixtures. It did not isolate external resources that jobs might deliberately share.

## Keep the routing contract

All three runners had the existing labels. The workflow kept:

```yaml
runs-on: [self-hosted, Linux, X64, fulano-ci]
```

GitHub treats these labels cumulatively: an eligible runner must match all of them.[^labels] A label selects a pool; it does not create capacity or reserve a runner exclusively for one workflow run.

That distinction mattered during verification. Several runs were competing for the same pool.

## Three green dots are not a concurrency test

I wanted overlapping job intervals on distinct runner names, not just three online agents.

The retained GitHub records showed these intervals on October 13, 2026, all UTC. Runner names are shortened here; X and Y denote two different workflow runs.[^incident]

| Runner | Run | Job | Started | Completed | Outcome |
|---|---|---|---|---|---|
| A | X | `infrastructure_memory` | 03:40:49 | 03:42:15 | Success |
| B | X | `infrastructure_subscription` | 03:39:04 | 03:54:04 | Cancelled |
| C | Y | `infrastructure_memory` | 03:38:03 | 03:45:21 | Failure |

The common interval was **03:40:49–03:42:15: 86 seconds** with three jobs in progress on three runners.

That proves pool-wide concurrency across two runs. It does not prove three jobs from one run overlapped, and the failure and cancellation do not become successes because the scheduling worked.

For your own audit, this read-only example retrieves job records for one exact run attempt. Replace the sample repository and run ID; use an authenticated GitHub CLI with appropriate repository access:

```bash
REPO=owner/repository
RUN_ID=123456789
ATTEMPT=1
endpoint="repos/${REPO:?required}/actions/runs/${RUN_ID:?required}"
gh api --paginate \
  "$endpoint/attempts/${ATTEMPT:?required}/jobs?per_page=100" \
  --jq '.jobs[] | [.runner_name, .name, .started_at, .completed_at, .conclusion] | @tsv'
```

GitHub's jobs API supplies the runner names and timestamps.[^jobs] Collect every relevant run and attempt when auditing a shared pool. Compare completed intervals: the latest start must precede the earliest completion. Queued time is not execution time.

These are job-lifecycle intervals, not measurements of continuous CPU activity.

## Correctness was a separate gate

A later run, checked against its exact commit, finished **11/11 jobs successfully**.[^incident] Six jobs used runner A and five used C. Its maximum overlap was two; B was servicing other repository work.

That is not a contradiction. One observation established three-job pool capacity. Another established a successful complete suite. Neither established a three-times-faster build.

There was no controlled before-and-after benchmark. The earlier run failed, and the final run competed with other work. I am not attaching a speedup percentage to that evidence.

## Isolation is also about what CI can reach

The new guests had host-enforced bridge firewall rules. Recorded checks blocked private-network ingress and egress while preserving outbound Internet access, including an egress probe from Docker using host networking. Runner credentials were restricted to mode `0600`. Services were enabled, and guest cold starts were checked—not a full physical-host reboot.

Those checks are useful, not a certificate that arbitrary workflow code is safe.

Persistent runners can retain a compromise between jobs; GitHub warns specifically about untrusted pull requests.[^security] Docker daemon access is powerful inside the runner guest.[^docker-security] And unprivileged LXCs still share the physical host's kernel; they are not VM security boundaries.[^lxc]

For untrusted contributions, I would require a different threat model, with clean disposable environments and tighter access controls. That is a recommendation, not something this rollout implemented.

## Scale the boundary, then measure

My checklist for the next queue is:

1. Count matching runners, not CPU cores.
2. Check dependencies and scheduling limits before adding machines.
3. Audit Docker names, ports, volumes and cleanup commands.
4. Separate the resources jobs can mutate; check host headroom.
5. Prove overlap with timestamps, then verify the suite independently.

This article reviews the retained rollout evidence. It does not claim a fresh infrastructure test today.

More runners gave us capacity. Separate Docker hosts made that capacity usable. The timestamps told us which claim we could actually make.

Parallelize the jobs, not their ability to break each other.

[^dispatcher]: GitHub's runner source, [`JobDispatcher.cs`](https://github.com/actions/runner/blob/main/src/Runner.Listener/JobDispatcher.cs), describes one job at a time.
[^network]: Docker documentation, [Host network driver](https://docs.docker.com/engine/network/drivers/host/).
[^labels]: GitHub documentation, [Using self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow).
[^incident]: Retained job records: run X [38341131740](https://github.com/juanmanuelramallo/fulano/actions/runs/38341131740), run Y [38340783812](https://github.com/juanmanuelramallo/fulano/actions/runs/38340783812), and final gate [38342888540](https://github.com/juanmanuelramallo/fulano/actions/runs/38342888540), all attempt 1. The final gate matched commit `86519f4b00af72aa44ecc6b15e6d789973e6de29`. Viewing the records requires repository access.
[^jobs]: GitHub REST documentation, [Workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt).
[^security]: GitHub documentation, [Secure use: hardening self-hosted runners](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).
[^docker-security]: Docker documentation, [Docker Engine security](https://docs.docker.com/engine/security/), daemon attack surface.
[^lxc]: Proxmox's documentation source, [Container Toolkit](https://github.com/proxmox/pve-docs/blob/master/pct.adoc), explains the shared kernel and container namespaces.
