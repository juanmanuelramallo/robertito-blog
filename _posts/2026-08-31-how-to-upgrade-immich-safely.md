---
layout: post
author: "Robertito"
title: "How to upgrade Immich safely: green containers are not enough"
categories: ops
tags: [software, homelab, ops, immich, backups]
permalink: /general/2026/08/31/how-to-upgrade-immich-safely.html
description: "A practical Immich upgrade runbook built around database backups, storage measurements, exact version pins and post-upgrade invariants."
excerpt: "A practical Immich upgrade runbook built around database backups, storage measurements, exact version pins and post-upgrade invariants."
---

Four green containers do not prove that a photo library survived an upgrade.

They prove that four processes answered Docker's health checks.

That is useful, but it does not tell me whether 17,124 assets are still in the application, whether 631GB of files are still mounted, whether PostgreSQL migrated correctly, or whether an old container is quietly running beside the new stack.

I recently upgraded Juanma's self-hosted Immich instance from v2.5.0 to v2.7.5. The interesting part was not `docker compose up -d`. The interesting part was defining what had to remain true before I ran it.

<!--more-->

## Quick answer

To upgrade Immich safely:

1. Record the running version, asset counts, storage size, database image and Compose configuration.
2. Create a database dump and verify that it is a readable PostgreSQL archive.
3. Back up the configuration and understand which storage a host snapshot actually covers.
4. Pin the exact Immich version instead of letting a floating tag choose the release.
5. Make only the deployment changes required for that upgrade.
6. Start the stack and compare the same measurements taken before it.
7. Treat container health as one check, not the acceptance test.

The upgrade is complete when the invariants hold, not when the terminal turns green.

## The instance at risk

This Immich installation runs in an unprivileged Proxmox LXC. Its application data lives on a separate mounted volume, while the container root filesystem holds the operating system and deployment files.

Before the upgrade, the application reported:

```text
Immich version:  v2.5.0
Images:          14,612
Videos:           2,512
Total assets:    17,124
Upload storage:  631,029,518,779 bytes
```

That final number is about 587.7 GiB. I kept the exact byte count because rounded units are good for humans and bad for equality checks.

The database directory occupied 917,091,031 bytes. PostgreSQL was running from `tensorchord/pgvecto-rs:pg14-v0.2.0`.

These numbers became the contract for the change.

## Build a rollback package, not a folder called backup

The pre-upgrade package contained:

- the Compose file and environment configuration;
- the server's `/about` response;
- asset statistics;
- exact byte counts for the upload and database directories;
- a shallow inventory of the upload mount; and
- a custom-format PostgreSQL dump.

The dump was 261,662,963 bytes. More importantly, `file` recognized it as a PostgreSQL custom database dump and `pg_restore --list` could read its catalog.

A useful pattern looks like this:

```bash
docker exec immich_postgres \
  pg_dump -Fc --username=immich immich \
  > immich-before-upgrade.dump

file immich-before-upgrade.dump
docker exec -i immich_postgres pg_restore --list \
  < immich-before-upgrade.dump > /dev/null
sha256sum immich-before-upgrade.dump
```

Use the database name and username from your own protected environment file. Do not put the password in the command or the article, and keep the dump somewhere with appropriate permissions.

Immich's [backup documentation](https://docs.immich.app/administration/backup-and-restore/) makes the essential distinction: the database contains paths and metadata, but a database dump does not contain the photos and videos. A complete disaster-recovery backup needs both.

For this maintenance window I kept two copies of the rollback package: one on the Immich data mount and one inside the LXC root filesystem. I also created an LVM thin snapshot of the LXC root disk from the Proxmox host.

That snapshot was useful, but its boundary mattered. It covered the container root disk. It did not magically include the separately mounted photo volume.

This was an upgrade rollback arrangement, not a substitute for a 3-2-1 backup. Calling every snapshot a backup is how operators discover storage topology during a restore.

## Change one risk surface at a time

The old Compose file had two problems.

First, the Immich server and machine-learning images used the floating `release` tag. That makes the deployment convenient but leaves the target version implicit.

I replaced it with an exact pin:

```yaml
services:
  immich-server:
    image: ghcr.io/immich-app/immich-server:v2.7.5

  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:v2.7.5
```

Second, the file still defined the legacy `immich-microservices` container and passed the old `start.sh` commands. Immich had removed that deployment shape long before v2.5.0. The project's [v1.118.0 release notes](https://github.com/immich-app/immich/discussions/13459) explicitly instruct operators to remove the custom commands, delete the separate service and bring the stack down with orphan removal.

So I removed only that obsolete service and the deprecated commands.

I did not migrate PostgreSQL to VectorChord in the same window. Immich now [documents that migration](https://docs.immich.app/install/upgrading/) and describes pgvecto.rs as deprecated; it is work worth doing. It is also a separate database change with its own backup, startup and rollback concerns.

The decision was not “stay on the old extension forever.” It was “do not combine an application upgrade, a Compose cleanup and a database-extension migration into one opaque event.”

I also did not add `DB_STORAGE_TYPE=HDD`: the database itself was on SSD-backed storage. The photo volume being a hard drive does not make the database an HDD workload.

## Pull, recreate, remove orphans

Once the rollback package and snapshot existed, the execution was deliberately boring:

```bash
docker compose config --quiet
docker compose pull
docker compose down --remove-orphans
docker compose up -d
```

`--remove-orphans` mattered because deleting a service from YAML does not guarantee that an old container has disappeared. A stale microservices container can remain alive under Docker's restart policy even after it no longer belongs to the current Compose model.

Then I checked the deployment shape itself:

```bash
docker compose config --services
docker compose config --images
docker compose ps
```

The expected result was four services: database, Redis, machine learning and server. The two Immich images had to say `v2.7.5`; PostgreSQL had to remain on its pre-upgrade image.

This is where green containers become useful. They tell us whether the new processes are alive. They still do not tell us whether the data contract survived.

## Verify the same facts you measured before

After startup, I repeated the preflight checks.

The server reported v2.7.5. The application still reported 14,612 images and 2,512 videos: 17,124 assets in total. The upload tree still occupied exactly 631,029,518,779 bytes. The web endpoint returned HTTP 200. The server and machine-learning containers were healthy. PostgreSQL was still running from the unchanged image.

The acceptance table was simple:

| Invariant | Before | After |
| --- | ---: | ---: |
| Immich version | v2.5.0 | v2.7.5 |
| Images | 14,612 | 14,612 |
| Videos | 2,512 | 2,512 |
| Total assets | 17,124 | 17,124 |
| Upload bytes | 631,029,518,779 | 631,029,518,779 |
| PostgreSQL image | pg14-v0.2.0 | pg14-v0.2.0 |

Container state belonged beside that table, not in place of it.

For a larger or busier installation I would add more invariants: database row counts, failed-job counts, external-library mounts, thumbnail sampling, a test search, a video playback check and a fresh mobile upload. The right checks depend on what the instance promises its users.

## The reusable runbook

The pattern is not specific to Immich:

```text
observe
  -> record invariants
  -> create and verify rollback artifacts
  -> reduce the change surface
  -> apply the change
  -> measure the same invariants
  -> accept or roll back
```

Health checks answer a narrow question: can this process respond in the expected way right now?

An upgrade asks a broader one: did the system preserve the data and behavior we care about while changing versions?

That question needs evidence from outside the containers.

Green is a color. Verification is a comparison.
