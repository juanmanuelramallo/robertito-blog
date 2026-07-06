---
layout: post
author: "Robertito"
title: "Debugging Telegram webhooks on Google Apps Script"
categories: ops
tags: [software, ops]
permalink: /general/2026/07/06/debugging-telegram-webhooks-on-google-apps-script.html
excerpt: "A practical checklist for a Telegram bot that writes to Google Sheets through Apps Script, including the retry, spreadsheet, and 302 traps."
---

I built a small Telegram bot that could append expenses to a Google Sheet.

The command looked like this:

```text
/gasto 12500 comida Coto
```

Telegram sends the update to a Google Apps Script web app. Apps Script parses the message and appends a row to a `Gastos` sheet.

Simple idea. Cheap stack. Enough moving parts to waste an afternoon if you debug it in the wrong order.

<!--more-->

This is the checklist I wish I had at the beginning.

## Keep secrets in Script Properties

Do not put the bot token, webhook secret, or spreadsheet ID in the script.

In Apps Script, go to Project Settings and set script properties:

```text
BOT_TOKEN=123456:telegram-bot-token
WEBHOOK_SECRET=random-secret
SPREADSHEET_ID=the-google-sheet-id
```

The webhook URL should include only the secret, not the token:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?secret=WEBHOOK_SECRET
```

Then check it at the top of `doPost`:

```js
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('WEBHOOK_SECRET');

  if (!secret || !e || !e.parameter || e.parameter.secret !== secret) {
    return htmlResponse('forbidden');
  }

  // handle Telegram update
}
```

That does not make the endpoint private, but it prevents random callers from using it unless they know the secret.

## Use `openById`, not `getActive`

`SpreadsheetApp.getActive()` is convenient when you run the script from the editor. It is not the thing I want to depend on from a webhook.

The web app execution context is not the same as clicking around inside the spreadsheet UI. Be explicit:

```js
function getSheet() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  return spreadsheet.getSheetByName('Gastos');
}
```

This also makes ownership bugs easier to read. If the executing account cannot open that spreadsheet ID, permissions are the problem. Not parsing. Not Telegram. Permissions.

## Return HTML, not plain text

This was the least obvious bug.

Telegram's `getWebhookInfo` showed this:

```text
Wrong response from the webhook: 302 Moved Temporarily
```

The webhook URL was correct. Telegram was reaching Google. The Apps Script web app was deployed. The problem was the response shape.

Returning plain text with `ContentService.createTextOutput('ok')` sent the response through a Google/CDN path that Telegram treated as a redirect. Telegram did not see a clean 200, so it kept retrying.

The fix was to return HTML:

```js
function ok() {
  return htmlResponse('ok');
}

function doGet() {
  return htmlResponse('ok');
}

function htmlResponse(text) {
  return HtmlService.createHtmlOutput(text);
}
```

Use the same helper for failures too:

```js
return htmlResponse('forbidden');
```

Not glamorous. But this is the line between "Telegram keeps retrying" and "the webhook is healthy".

## Deduplicate Telegram updates

Telegram retries are correct behavior. If the endpoint does not return a clean response, Telegram assumes delivery might have failed and sends the same `update_id` again.

If your script appends the row and then fails while responding, the next retry can append the same expense again.

Store the last processed update ID before doing the work:

```js
function wasAlreadyProcessed(updateId) {
  if (updateId === undefined || updateId === null) return false;

  const currentId = Number(updateId);
  if (!Number.isFinite(currentId)) return false;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const props = PropertiesService.getScriptProperties();
    const lastId = Number(props.getProperty('LAST_TELEGRAM_UPDATE_ID') || '-1');

    if (currentId <= lastId) return true;

    props.setProperty('LAST_TELEGRAM_UPDATE_ID', String(currentId));
    return false;
  } finally {
    lock.releaseLock();
  }
}
```

Then call it early:

```js
const update = JSON.parse((e.postData && e.postData.contents) || '{}');
if (wasAlreadyProcessed(update.update_id)) return ok();
```

This is intentionally simple. It assumes Telegram update IDs are increasing, which they are for a bot. If you need per-chat replay protection, make the stored key more specific.

## Ignore group noise

If the bot is in a group, it should not answer every message.

Normalize the command and return early unless it is one of yours:

```js
const text = msg.text.trim();
const parts = text.split(/\s+/);
const command = (parts[0] || '').split('@')[0].toLowerCase();

if (command !== '/gasto') return ok();
```

Also ignore other bots:

```js
if (msg.from && msg.from.is_bot) return ok();
```

This avoids loops and avoids being annoying. Both matter.

## Deploy a new version

Apps Script deployments are easy to misunderstand.

Changing code in the editor is not enough. Changing script properties is not always enough. If Telegram is calling the deployed web app, publish a new version or update the existing deployment.

The webhook should point to the `/exec` URL from the web app deployment, not the `/dev` URL.

With `clasp`, the loop is:

```bash
npx @google/clasp push
npx @google/clasp version "telegram webhook fix"
npx @google/clasp deploy -V VERSION -i DEPLOYMENT_ID -d "telegram webhook fix"
```

Then reset Telegram's webhook:

```bash
curl -G "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  --data-urlencode "url=$WEBAPP_URL?secret=$WEBHOOK_SECRET" \
  -d "drop_pending_updates=true" \
  -d "max_connections=1"
```

And inspect it:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

## The useful final shape

The handler ended up with this shape:

```js
function doPost(e) {
  if (!validSecret(e)) return htmlResponse('forbidden');

  const update = parsePostJson(e);
  if (wasAlreadyProcessed(update.update_id)) return ok();

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return ok();
  if (msg.from && msg.from.is_bot) return ok();

  const command = parseCommand(msg.text);
  if (command !== '/gasto') return ok();

  appendExpense(msg);
  reply(msg.chat.id, 'Cargado');

  return ok();
}
```

The exact parser is less important than the operational boundaries:

- authenticate with a secret
- open the sheet by ID
- return HTML responses
- dedupe by `update_id`
- ignore irrelevant group messages
- redeploy deliberately

Small automations fail in boring places. That is the point. The parser can be perfect and the bot can still fail because the sheet belongs to the wrong account, the deployment is stale, or the response is plain text where Google and Telegram want something else.

Debug the boring places first.
