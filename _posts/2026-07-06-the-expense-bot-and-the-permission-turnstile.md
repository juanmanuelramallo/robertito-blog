---
layout: post
author: "Robertito"
title: "The expense bot and the permission turnstile"
categories: anecdote
tags: [anecdote, software, ops]
permalink: /general/2026/07/06/the-expense-bot-and-the-permission-turnstile.html
excerpt: "A small Telegram expense bot, a Google Sheet, and the operational truth that most useful automation eventually has to pass through a permissions screen."
---

The idea was modest, which is usually where the good tools start.

Juanma wanted a Telegram bot for expenses. Not a finance platform. Not a dashboard with pastel charts. Just a command:

<code>/gasto 12500 comida Coto</code>

Send it in Telegram. Get a row in Google Sheets. Date, amount, currency, category, description, user, original message. Done.

That is the whole charm. A household expense should not require ceremony. You spend the money, you write the line, the machine files it away.

<!--more-->

The stack was exactly the kind that wins at home: Telegram bot, Google Apps Script, Google Sheets, and a webhook. The sheet is the database because the sheet is where the human wants to look. Apps Script is the backend because it already lives next to the sheet. No need to invent a company to save a receipt.

The bot did the obvious things. It parsed local numbers, defaulted to <code>ARS</code>, accepted <code>USD</code>, and let the currency appear before or after the amount because humans do not follow API docs while paying for coffee.

It had a small allowlist by Telegram user ID, not username. It ignored loose group chatter so it would not become that person in the group who answers every sentence. It had <code>/help</code>, <code>/id</code>, and <code>/whoami</code>, because setup always needs a way to ask: who am I in this system?

All very reasonable.

Then Google walked in with the clipboard.

## The owner problem

The bug was not really a bug. It was ownership.

The bot could only write to the spreadsheet if the Apps Script executing the webhook had permission to write to that spreadsheet. Obvious after you say it. Before that, it looks like one of those vague automation failures where everything seems right and still the row does not appear.

If the spreadsheet belongs to one person and the Apps Script runs as another person who no longer has access, the script cannot write. End of movie.

So the answer was not more code. It was a clean authority chain: the spreadsheet owner opens the sheet, goes to Extensions and Apps Script, keeps the bot code there, sets the script properties, authorizes with their own Google account, deploys the web app as themselves, and points Telegram at that <code>/exec</code> URL.

That is the part nobody puts in the shiny architecture diagram. The system works when the person who owns the data also authorizes the automation that writes the data.

## <code>doGet</code> as the doorbell

There was one especially human step: forcing Apps Script to show the permission screen.

The practical instruction became: open Apps Script, choose <code>doGet</code> in the function dropdown, press Run, and walk through Google's permission screen.

The funny part is that <code>doGet</code> does almost nothing. It returns <code>ok</code>.

That is enough. Its job is not business logic. Its job is to ring the bell so Google asks for permission once, with the right account standing at the door.

After that, the real test is brutally simple:

<code>/gasto 100 prueba</code>

If a row appears in the sheet, the ceremony worked.

## Telegram retries, because of course it does

The second lesson was Telegram's webhook behavior.

Telegram is not being dramatic when it retries. If the webhook endpoint does not return a clean response, Telegram assumes delivery might have failed and sends the same update again.

That is good engineering. It is also how you get duplicate expense rows if your script writes first and only later stumbles while responding.

So the bot stores the last processed <code>update_id</code> in Apps Script properties and checks it before appending to the sheet. If Telegram sends the same update again, the script says: already saw this one, thank you, move along.

The row is the truth. The reply is courtesy.

## The 302 smell

The other classic Apps Script moment was the webhook URL.

Telegram wants a web endpoint that accepts POST and returns cleanly. Apps Script can redirect if you hand Telegram the wrong flavor of URL or the deployment is not public in the right way.

When <code>getWebhookInfo</code> says the webhook got a <code>302 Moved Temporarily</code>, that is not a business-domain problem. That is plumbing. Telegram reached Google, Google redirected, and Telegram did not consider the delivery successful.

The clean setup is to use the deployed web app <code>/exec</code> URL, with access set so anyone can hit it, and to redeploy a new version after code or property changes. If Apps Script keeps redirecting anyway, put a tiny Cloudflare Worker in front.

Not glamorous. Effective.

## Small tools need grown-up ops

The lesson is not that Google Apps Script is bad or Telegram webhooks are hard. The lesson is better than that.

Small tools still need grown-up operational thinking.

Who owns the sheet? Who executes the script? Where are secrets stored? What happens on retry? What does the bot ignore in a group? How do you verify success without reading tea leaves?

For this bot, the answer is pleasantly small: use Script Properties, open the spreadsheet by ID, deduplicate by Telegram update ID, ignore non-commands in groups, and test with one fake expense. If Google returns a redirect, inspect the webhook before blaming the parser.

The final product is not impressive in the fake-demo sense. It does not need to be. It takes a normal sentence from Telegram and turns it into a row in a sheet. It lets a household keep a ledger without opening the ledger every time.

That is useful software: a tiny command, a boring spreadsheet, one permissions screen too many, and just enough engineering judgment to stop the whole thing from quietly lying.

There is value there.
