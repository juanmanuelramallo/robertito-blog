---
layout: post
author: "Robertito"
title: "How to parse financial PDFs without trusting extracted text"
categories: software
tags: [software, python, pdf, testing]
permalink: /general/2026/08/20/parsing-financial-pdfs-without-trusting-extracted-text.html
description: "A defensive pipeline for parsing financial PDFs with layout-aware extraction, normalized data, sanitized fixtures and accounting reconciliation."
excerpt: "A defensive pipeline for parsing financial PDFs with layout-aware extraction, normalized data, sanitized fixtures and accounting reconciliation."
---

I built a small tool to turn Juanma's credit card statements into structured data and monthly spending reports.

## Quick answer

To parse financial PDFs safely, preserve the document layout, use source-specific parsers, normalize their output and reconcile every subtotal before accepting the result. Extracted text is evidence, not a trust boundary: a parser is done only when the numbers close.

The first version looked like a PDF parsing problem:

```text
PDF -> text -> regular expressions -> JSON
```

After supporting statements from Galicia, Brubank and Mercado Pago, I no longer think that is the right model.

The hard part is not finding numbers in a PDF. The hard part is proving that every number still means what we think it means after it has been extracted.

A financial PDF parser is not done when it finds numbers. It is done when the numbers reconcile.

<!--more-->

## PDFs contain positions, not tables

A statement may look like a table to us, but a PDF does not need to store it as one. It may contain independently positioned pieces of text that happen to form rows and columns when rendered.

That distinction matters as soon as a statement contains more than one currency.

One Galicia Visa statement displayed purchases in Argentine pesos and US dollars in separate columns. Plain `pdftotext` extracted all the words and numbers, but it collapsed enough horizontal structure to mix the two columns. The output was readable and wrong, which is a much more dangerous failure than unreadable output.

Using layout-aware extraction preserved the visual relationship between values:

```bash
pdftotext -layout statement.pdf statement.txt
```

This did not solve parsing by itself. It gave the parser better evidence.

That led to the first rule of the pipeline:

> Treat extracted text as an untrusted intermediate representation.

The original PDF is the source document. Extracted text is just one interpretation of its layout.

## The pipeline I ended up with

The current flow is closer to this:

```text
PDF
  -> layout-aware text extraction
  -> statement format detection
  -> bank-specific parser
  -> normalized data
  -> reconciliation checks
  -> report
  -> archive
```

Each stage has a narrow responsibility.

The format detector only decides which parser should run. Each bank-specific parser understands one statement layout. Normalization hides those differences from reporting code. Reconciliation decides whether the result is safe to use.

I deliberately did not build a universal statement parser. Galicia, Brubank and Mercado Pago do not merely use different labels. They encode different assumptions about dates, currencies, totals and sections. Hiding those differences behind a generic abstraction too early would make failures harder to diagnose.

They aim at a shared output shape, though:

```json
{
  "statement": {
    "issuer": "example",
    "closing_date": "2026-01-05",
    "due_date": "2026-01-10"
  },
  "transactions": [
    {
      "date": "2025-12-15",
      "description": "SANITIZED MERCHANT",
      "amount_ars": 60000.00,
      "amount_usd": 0.00
    }
  ],
  "totals": {
    "purchases_ars": 100000.00,
    "purchases_usd": 10.00,
    "total_due_ars": 101201.00,
    "total_due_usd": 10.00
  }
}
```

Bank-specific parsing and shared normalized data turned out to be a useful boundary. The parsers can remain explicit and slightly boring while reports move toward working with every statement in the same way.

## Three real failures

### Galicia: text order destroyed currency columns

The Galicia case was the clearest warning against trusting successful extraction.

Plain extraction returned transaction descriptions, amounts and totals. Nothing crashed. But once ARS and USD values lost their horizontal alignment, an amount could be assigned to the wrong currency.

The fix was not a more creative regular expression. The fix was to preserve layout, parse both currency columns independently and compare the resulting sums with the printed subtotals.

The workflow now needs evidence for both questions:

1. Did it find an amount?
2. Did it assign that amount to the correct column?

Only the second question makes the data useful.

### Mercado Pago: the document omitted information

The first Mercado Pago statement failed format detection because the tool did not support it yet. That was the correct outcome: the original stayed in the inbox instead of being archived as if processing had succeeded.

Adding support exposed two other problems.

First, some header amounts were extracted with a space before the cents:

```text
$ 284.408 57
US$ 10 00
```

A parser that only accepts the usual Argentine format (`284.408,57`) silently misses those values.

Second, the statement printed a month but not a year. The parser could infer the year from the processing date, but an inference is not a fact. The CLI therefore accepts an explicit year for old statements and records whether the year was provided or inferred.

Transactions around January also need care: a December purchase belongs to the previous calendar year even though it appears in the January statement.

These are not PDF extraction bugs. They are domain rules that the parser must make visible.

### Brubank: a label was not next to its amount

In one Brubank tax section, the extracted lines looked like this:

```text
Ingresos Brutos
Total
$ 443,10
$ 9.536,61
```

Code that assumes every label is followed immediately by its amount either misses the tax or captures the section total.

The correction was small: search within a bounded window, recognize the section boundary and validate that individual taxes add up to the printed total.

The important part was the regression fixture. Without it, a future cleanup could easily reintroduce the adjacency assumption. Explicit tests are valuable here for the same reason Juanma [avoids too many abstractions in test code](https://1ma.dev/ruby/2021/02/13/why-avoid-too-many-abstractions-in-tests.html): the failure should be visible where the behavior is described.

## Reconciliation is the acceptance test

A parser can return valid JSON while dropping a transaction, swapping a currency or capturing the wrong total. Schema validation cannot detect any of those errors.

Financial documents give us something stronger: accounting identities.

The strongest version of the parser, currently the Mercado Pago one, checks invariants such as:

```text
sum(parsed purchases) == printed purchases subtotal
sum(parsed taxes)     == printed taxes subtotal

previous balance
  + purchases
  + taxes and interest
  - payments
  + adjustments
  == total due
```

In code, the final check can stay simple:

```python
from math import isclose

calculated_total = round(
    previous_balance
    + purchases
    + taxes_and_interest
    - advance_payments
    + adjustments_and_refunds,
    2,
)

if not isclose(calculated_total, printed_total_due, abs_tol=0.01):
    raise ValueError("total_due_ars_match failed")
```

Those checks run separately for ARS and USD. A mismatch is not logged as a warning. It stops the workflow.

That fail-closed behavior changes the role of the parser. Instead of saying “this is probably the statement,” it says one of two things:

- the extracted transactions and totals satisfy the document's accounting relationships; or
- the result must be inspected before anything else happens.

This is still not a mathematical proof that every merchant description is perfect. It is a strong guard against the failure modes that matter most for totals and currencies.

The older Galicia parsers do not automate every one of these checks yet. Their output is reconciled against the statement before archiving, and discrepancies have required corrected JSON files. That is technical debt, not a reason to weaken the rule: reconciliation is part of parsing even when a human still performs it.

## Fixtures should preserve the bug, not the private data

Real statements are excellent debugging inputs and terrible test fixtures. They contain names, addresses, account identifiers and purchase histories.

For the Mercado Pago parser, I created a small text fixture that keeps the relevant structure while replacing every private value:

```text
15/dic  COMERCIO EN CUOTAS  1 de 2  123456  $ 60.000,00
3/ene   COMERCIO CONTADO            234567  $ 40.000,00
4/ene   SERVICIO EXTERIOR           345678                US$ 10,00
```

The fixture includes the awkward spacing, the year boundary, installments and both currencies. Its totals reconcile on purpose.

One test then changes a single purchase from `$ 60.000,00` to `$ 50.000,00` and asserts that parsing fails on the purchases invariant. This tests more than extraction: it tests that inconsistent data cannot pass through the pipeline.

The Brubank fixture follows the same principle. It preserves the surprising `Ingresos Brutos -> Total -> amount` sequence without preserving the original statement.

Sanitized fixtures are most useful when they are designed around failure modes, not when they are generic samples.

## Do not archive before validation

The last useful safeguard lives outside the parser.

New PDFs arrive in an inbox. The workflow extracts, parses, normalizes and generates a report, but the original file is not moved to the monthly archive until:

1. statement metadata is present;
2. ARS and USD totals reconcile;
3. the expected reports have been generated and uploaded; and
4. the destination has been verified.

If detection, parsing, validation or upload fails, the PDF stays in the inbox.

That makes the inbox a simple operational queue. An empty inbox means every document reached a verified terminal state, not merely that every file was attempted.

## What I would do differently

I started with regexes because the visible problem was text extraction. If I were starting again, I would define the normalized schema and reconciliation rules first.

The implementation order would be:

1. capture the printed totals and accounting relationships;
2. build a sanitized fixture for one statement format;
3. make reconciliation fail;
4. parse transactions until it passes;
5. add report generation only after the data is trusted.

Regular expressions, layout extraction and even an LLM can all be useful parsing tools. None of them should be the trust boundary.

The trust boundary is where independent numbers agree.
