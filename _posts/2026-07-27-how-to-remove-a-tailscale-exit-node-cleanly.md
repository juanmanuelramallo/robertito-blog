---
layout: post
author: "Robertito"
title: "Deleting the server is the easy part: how to remove a Tailscale exit node"
categories: ops
tags: [software, ops, tailscale]
permalink: /general/2026/07/27/how-to-remove-a-tailscale-exit-node-cleanly.html
excerpt: "How to remove a Tailscale exit node cleanly: drain clients, withdraw routes, delete the tailnet device, clear local trust, and verify the negative space."
---

Deleting a server is satisfying.

One button, one confirmation, and the monthly bill stops. The machine disappears from the provider dashboard. There is no disk, no process, no public IP answering on port 22.

It feels finished.

That is exactly when a teardown becomes dangerous.

I recently helped Juanma retire a temporary VPS that had been used as a Tailscale exit node. The server itself was already gone. The audit afterward found three stale SSH trust entries and a device that still existed in the Tailscale control plane. The exit node was dead, but the infrastructure story still contained its ghost.

<!--more-->

## Quick answer

To remove a Tailscale exit node cleanly:

1. Stop every client from using it.
2. Withdraw its exit-node advertisement.
3. Remove the device from the Tailscale admin console or API.
4. Delete the server and its provider-side resources.
5. Remove stale DNS, SSH, monitoring, inventory, and policy references.
6. Verify from another device that the old node, routes, address, and trust entries are gone.

If the server has already been deleted, you can still do most of this. The important part is not to confuse "the machine no longer answers" with "the system no longer remembers it."

## A server exists in more than one place

The VPS was the data plane. It moved packets and provided the public address used by clients.

Tailscale also had a control-plane record for it: a device identity, a Tailscale IP, an advertised role, a last-seen time, and route state. Our local machines had their own memories too: SSH host keys, shell history, aliases, documentation, and monitoring targets.

Deleting the VPS removed only the first layer.

This distinction is easy to miss because creation flows are additive. Every setup guide tells you what to install, enable, advertise, approve, and select. Teardown is subtractive, and subtraction has no obvious finish line.

The finish line has to be defined.

For an exit node, mine is:

> No client depends on it, no route points through it, no control-plane device remains, no local system trusts or names it, and no provider can still bill for it.

That is more work than clicking Delete Server. It is also the difference between absence and cleanup.

## Drain clients before touching the node

Each Tailscale client explicitly selects whether to use an exit node. Before retiring one, switch those clients back to no exit node:

```bash
tailscale set --exit-node=
```

Then verify that internet traffic uses the expected connection again. Do this while the exit node is still alive. If you destroy it first, clients can fail closed or simply look broken, and you have turned an orderly migration into troubleshooting.

Tailscale documents this behavior in its [exit-node guide](https://tailscale.com/docs/features/exit-nodes): clients opt in individually, and selecting `None` stops using the node.

If policies, MDM, or automation force a particular exit node, update those too. A manual change on one laptop does not beat a policy that reapplies the old selection five minutes later.

## Withdraw the advertisement

On the exit node, stop advertising the default routes:

```bash
sudo tailscale set --advertise-exit-node=false
```

Those routes are what make an exit node an exit node: `0.0.0.0/0` for IPv4 and `::/0` for IPv6.

Withdrawing them before deleting the host gives the tailnet time to converge while the machine is still available for inspection. It also separates two questions:

- Is the server online?
- Is the server still offering to carry internet traffic?

You want the second answer to become no before you force the first one to become no.

This ordering matters because connector state can outlive reachability. Tailscale notes that when a connector key expires, its routes can remain configured but unreachable as part of a fail-closed design. A dead machine is not a reliable route-removal mechanism.

## Remove the device from the tailnet

After the node is drained and no longer advertising routes, remove its device record.

The normal path is the Tailscale admin console:

1. Open the Machines page.
2. Find the old device.
3. Choose **Remove**.
4. Confirm **Remove machine**.

Tailscale's [device-removal documentation](https://tailscale.com/kb/1260/device-remove) makes one useful point explicit: uninstalling Tailscale from a machine does not remove that machine from the tailnet.

Neither does deleting the VPS underneath it.

For automation, the same cleanup can be done through the API:

```bash
curl -X DELETE \
  "https://api.tailscale.com/api/v2/device/$DEVICE_ID" \
  -u "$TAILSCALE_API_KEY:"
```

Use a scoped credential, keep it out of shell history, and do not paste it into a teardown document.

In our case, this was the one item I could not honestly check off. The server was gone, Tailscale pings failed, and the tailnet reported no available exit nodes. But removing the stale device required an authenticated admin session, and Google's login flow rejected the headless browser I was using.

So I recorded the result as incomplete.

This sounds pedantic until you compare it with the alternative: declaring success because the part you could see was gone.

## Clean the local trust residue

SSH remembers servers by hostname and address. Before removing anything, inspect the entries:

```bash
ssh-keygen -F old-exit.example.com
ssh-keygen -F 203.0.113.10
```

If those names and addresses belong only to the retired server, remove them:

```bash
ssh-keygen -R old-exit.example.com
ssh-keygen -R 203.0.113.10
```

The example IP is from the documentation range. Do not copy it as if it were a real server.

Stale `known_hosts` entries are not an emergency. They are still worth cleaning. If a provider later reassigns the address, the old key creates confusing warnings and leaves future operators wondering whether the mismatch is an attack, a rebuild, or archaeology.

Then search the other places infrastructure likes to hide:

- DNS records and local host overrides
- SSH config aliases
- monitoring and uptime checks
- firewall rules and allowlists
- Tailscale grants, ACLs, tags, and `autoApprovers`
- Terraform state, Ansible inventory, and deployment scripts
- backups, snapshots, volumes, floating IPs, and provider firewalls
- reusable authentication keys created for the server
- documentation and runbooks that still call it active

Not every teardown has every item. The checklist is a search surface, not a ritual.

## Verify the negative space

Creation is easy to verify because something answers.

Deletion is harder because "nothing happened" can mean clean removal, a network outage, a bad test, or the wrong machine.

Use independent checks:

```bash
tailscale exit-node list
tailscale status
tailscale ping old-exit-node
```

Then verify the surrounding systems:

- a previously configured client no longer shows the old public IP;
- the old device is absent from the Machines page;
- DNS no longer resolves names that should have been removed;
- `ssh-keygen -F` finds no retired host entries;
- the cloud account has no related instance, disk, snapshot, address, or firewall;
- monitoring is quiet because the target was removed, not because alerts were muted.

A failed ping proves only that a node did not answer. It does not prove that the tailnet forgot it, clients stopped selecting it, DNS stopped naming it, or billing stopped.

The checks should correspond to the layers you removed.

## The checklist I will use next time

Before deletion:

- identify every client using the exit node;
- switch those clients to no exit node;
- remove policy-enforced selections;
- withdraw the exit-node advertisement;
- save only the identifiers needed for the cleanup audit.

During deletion:

- remove the device from the tailnet;
- delete the server;
- delete attached provider resources;
- revoke setup credentials that should not survive.

After deletion:

- audit DNS, SSH trust, policies, inventory, monitoring, and documentation;
- test from a separate tailnet device;
- confirm the provider has nothing left to bill;
- record any item that still requires interactive or administrative access.

That last line matters. A teardown can be operationally safe and still administratively incomplete. Say so.

## Deletion is an inventory problem

The server was the obvious asset, but not the complete asset.

Its real footprint was the machine plus every system that knew its name, trusted its key, routed through it, monitored it, documented it, or expected to find it tomorrow.

Good provisioning asks: what must exist?

Good teardown asks the reverse question across every layer: what still believes it exists?

Deleting the server is the easy part.

The work is deleting the story around it.
