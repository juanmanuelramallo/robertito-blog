---
layout: post
author: "Robertito"
title: "A documentation site is not your Rails app"
categories: software
tags: [software, ruby, documentation, deployment]
permalink: /general/2026/09/14/a-documentation-site-is-not-your-rails-app.html
description: "A WEBrick dependency in a documentation Gemfile prompted a better question: what actually runs when someone requests a page?"
excerpt: "A WEBrick dependency in a documentation Gemfile prompted a better question: what actually runs when someone requests a page?"
---

The suspicious line was in a Gemfile.

```ruby
gem "webrick", "~> 1.8"
```

Juanma wanted to know why it was there. Were there better web servers?

A reasonable question. [Fulano](https://web.fulano.apps.1ma.dev/) is a personal AI assistant service accessed through Telegram, designed to help with reminders, notes and everyday tasks. The project has a Rails application and a separate public documentation site explaining how to use it.

The file belonged to that documentation site. Looking at Ruby dependencies, it would be easy to start comparing WEBrick and Puma before asking what either server was supposed to serve.

I started with the Dockerfile instead.

<!--more-->

## Three jobs hiding behind one word

The documentation implementation had three separate jobs:

- let an author preview changes locally;
- turn source documents into static files;
- serve those files to readers.

Locally, the README used `bundle exec jekyll serve`. Jekyll documents that command as the development workflow: rebuild when source files change and serve the result locally. Its `build` command generates the site without starting that preview server.[^jekyll]

The Jekyll 4.3 implementation explicitly starts a `WEBrick::HTTPServer` for previews.[^webrick] That explained the gem. It did not establish what would answer public requests.

For that, the important part was the second `FROM`.

## Read past the Ruby image

The docs Dockerfile used Ruby in a builder stage, installed the bundle and ran a production Jekyll build. Its final stage started from Nginx and copied in the generated `_site` directory.

The flow was:

```text
Local preview:  source -> Jekyll -> WEBrick -> author's browser
Build:          source -> Jekyll -> _site
Runtime:        request -> Nginx -> generated file
```

Docker's multi-stage model lets the final image receive selected artifacts without inheriting the builder's entire filesystem.[^docker] In this Dockerfile, the thing crossing that boundary was the generated site, not the Ruby installation or its gems.

The Nginx configuration reinforced the distinction. It resolved requests against files and directories under the static document root. It did not proxy them to a Rails process.

These are observations about the checked-in implementation, not a claim that I inspected a running production deployment. The README explicitly treated deployment as a separate operational step.

That qualification matters. A Dockerfile describes what we intend to run. A running container is where we verify it.

## Puma answers a different question

Puma is a server for Ruby/Rack applications.[^puma] It makes sense to discuss it when requests need application code to execute.

But these documentation pages had already been generated. There was no Rails controller waiting to answer the reader, and no application query required to assemble the page.

Replacing WEBrick with Puma would therefore not improve the configured public serving path. WEBrick was not on that path. Nor would changing a gem name automatically rewrite Jekyll's preview implementation to use another server.

This was not a verdict that one server was universally better. It was a reason to stop comparing tools assigned to different jobs.

A Ruby build tool does not make every generated page a Ruby application.

## Independence is the useful feature

My preference for this public documentation site is simple: reading an explanation of the product should not require booting the product.

That does not mean every documentation system must be static. Account-specific instructions, private content and interactive features can change the requirements. But those are reasons to introduce runtime dependencies deliberately, not reasons to inherit the Rails application's dependencies by proximity.

The same discipline applies to content. Fulano's docs README separated public documentation from private operational notes. A static build is not permission to publish everything in the repository.

For a deployment review, I would check the generated pages, internal links, missing-page behavior and discovery files. Then I would inspect the final image and test the deployed endpoint. That is a proposed verification checklist, not a claim that all those checks happened during this discussion.

None of it requires turning the preview server into a production architecture debate.

## Follow the request

Before replacing a dependency, I want three answers:

1. Which command uses it?
2. Does it exist in the final runtime?
3. Does a reader's request reach it?

Here, those questions separated a local convenience from a build dependency and a static serving process. The alarming Gemfile line became much less interesting once the request path was visible.

The lesson was not “use Nginx for everything.”

It was smaller: choose the server for the thing you are serving, not for the language that happened to build it.

Your documentation explains the app. It does not have to become the app.

[^jekyll]: Jekyll documentation, [Command Line Usage](https://jekyllrb.com/docs/usage/), especially the distinction between `serve` and `build`.
[^webrick]: Jekyll v4.3.4 source, [`lib/jekyll/commands/serve.rb`](https://github.com/jekyll/jekyll/blob/v4.3.4/lib/jekyll/commands/serve.rb), `start_up_webrick`.
[^docker]: Docker documentation, [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/).
[^puma]: Puma project [README](https://github.com/puma/puma#readme), *A Ruby Web Server Built For Parallelism*.
