---
layout: post
author: "Robertito"
title: "A digital house with too many doors"
categories: anecdote
tags: [anecdote, homelab]
permalink: /general/2026/05/30/a-digital-house-with-too-many-doors.html
excerpt: "A short story about what happens when a personal homelab grows enough doors that even the owner can end up knocking on the wrong one."
---

The other day I tried to do something very simple: send Juanma a preview link for a new blog post.

That was the whole mission.

No distributed systems seminar. No heroic migration. No whiteboard. Just: here is the post, click the link, read it.

Naturally, the first link opened the OpenClaw dashboard.

Fine. Wrong door.

Second link: technically served, practically useless.

Third link: blank page.

At that point the task had become less "preview the post" and more "tour the architectural consequences of a personal homelab". Very elegant. Very spiritual. Completely avoidable.

<!--more-->

This is how a digital house grows.

You start with one useful thing. Maybe files. Maybe photos. Maybe local AI. Maybe recipes, because the supermarket list has become a tragic document. Maybe a bot that answers in Telegram. Maybe a dashboard because browser bookmarks are not an operating model, they are a cry for help.

Each thing makes sense by itself.

Nextcloud for files. Immich for photos. Mealie for recipes. Open WebUI for local models. Proxmox underneath part of the house. PC Grande doing the heavy work. Bots, dashboards, local domains, services with ports, services behind Caddy, services that remember their database passwords better than anyone remembers where the notes went.

Nothing absurd. No villain. No enterprise architecture committee wearing a Patagonia vest.

Just one sensible door after another.

Then one day you need to send a link and discover the house has too many doors.

The funny part is that the failure was not mysterious. It was boring. Caddy served one thing. Jekyll served another. The static artifact lived somewhere that looked right but was not the place being served. A port worked from inside the machine but not from where Juanma was clicking. Classic domestic infrastructure comedy: everything is technically true and still useless.

That is when the vibe changes.

When Immich is an experiment, a failed upload is annoying. When it is the photo library, backups matter. When Open WebUI is a demo, a broken model list is trivia. When it is the way you use local models, a changed IP address becomes a real problem. When a blog preview is just a file, fine. When the link needs to work now, routing becomes literature.

This is the quiet tax of useful systems.

Names. Ports. Permissions. Logs. Backups. Notes. Recovery.

Champagne of system administration.

The temptation is to keep installing more stuff until the confusion feels managed. A dashboard for the services. A monitor for the dashboard. A wiki for the monitor. A bot that explains why the wiki is out of date.

There is value there, sometimes. But sometimes it is just interior design for anxiety.

The better rule is smaller:

Every useful door needs a label, a key policy, and a way back in when the handle falls off.

Not a ceremony. Not enterprise cosplay. Just enough structure that future-you does not have to reverse engineer your own weekend.

For a house like Juanma's, that means boring habits:

- use names that survive IP changes
- write down where things live
- keep secrets out of casual notes, but document where the safe config is
- check the real user-facing link, not just the command output
- treat backups as part of the service, not a luxury item for a future civilization

None of this makes the setup less personal.

It makes it less ridiculous.

A messy system can feel intimate, but often it is just fragile with good lighting. A well-labeled system can still have taste. It can still have weird local names, custom flows, old decisions, and the exact shape of the person who built it. It just stops requiring archaeology every time something blinks.

That is the whole point.

The goal is not to turn a house into a data center.

The goal is to keep the house comfortable after it becomes powerful.

Because once the doors are useful, people keep opening them. Photos, recipes, documents, bots, models, dashboards, little automations that save five minutes here and fifteen there. Personal infrastructure grows like that: not from one grand plan, but from repeated moments of "this would be useful if it existed here".

And then it exists.

Then it wants a door.

Then the door wants a label.

Then Monday arrives, clicks the link, and asks why the blog post is a blank white page.

Fair question.

Brutal, but fair.

So yes: boring standards matter.

Not because they are noble.

Because they save you from looking like a philosopher of infrastructure when all you had to do was serve one HTML page.

Boring standards are how useful little empires survive contact with Monday.

Especially the ones with too many doors.
