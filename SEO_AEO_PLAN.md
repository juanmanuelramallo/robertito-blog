# SEO and AEO Plan for 1ma.dev

This plan is for `1ma.dev`, the personal technical blog running on Jekyll.

The goal is not to chase broad keywords like "software" or "programming". That is a bad market for a small personal blog. The practical goal is to win specific long-tail searches from developers and make the best posts easy for answer engines to understand, quote, and cite.

## Strategy 1: Technical Discoverability

Search engines and answer engines need to crawl, index, and understand the site without friction.

### Actions

- Keep `sitemap.xml` and `feed.xml` generated and linked from the HTML head.
- Add a source `robots.txt` that allows normal search crawlers and answer-engine crawlers.
- Add `llms.txt` with a concise description of the blog and the most useful public URLs.
- Replace the old Universal Analytics tag with the GA4 measurement ID for the blog property.
- Keep `jekyll-seo-tag` enabled and verify generated metadata after every template change.
- Use Google Search Console for sitemap submission, indexing checks, query data, and coverage issues.

### Success Checks

- `robots.txt`, `llms.txt`, `sitemap.xml`, and `feed.xml` are available in the built site.
- Production pages include GA4, not the old `UA-*` tag.
- Search Console shows the sitemap as discovered and no major indexing blockers.

## Strategy 2: Long-Tail Developer Topic Clusters

The blog should target concrete questions developers actually search for. Broad opinion pieces are fine, but they need supporting practical posts and internal links.

### Initial Clusters

1. Ruby and Rails
   - Ruby object design
   - Rails defaults
   - testing practices
   - avoiding unnecessary abstractions

2. Simple Deployments and Operations
   - Dokku
   - Apache Superset
   - process debugging
   - small app operations

3. Engineering Judgment
   - boring technology
   - side projects
   - tool selection
   - small-team software decisions

### Actions

- Create one index page per cluster once there are enough posts to justify it.
- Add internal links from older posts to newer related posts.
- Give every new post a clear excerpt that states the problem and result.
- Prefer titles that match developer intent: "How to...", "Why...", "When to...", "What to choose...".

### Success Checks

- Each new post links to at least one related existing post when relevant.
- Existing high-fit posts are refreshed with better excerpts and internal links.
- Search Console starts showing specific long-tail queries, not just branded or homepage traffic.

## Strategy 3: Answer-First Content for AEO

Answer engines prefer pages where the main answer, definitions, and criteria are easy to extract. This does not mean writing bland SEO sludge. It means putting the useful answer where machines and humans can both find it.

### Actions

- Add a short "Quick answer" section near the top of practical and opinion posts.
- Use question-shaped headings when they match the query.
- Include concise definitions and criteria lists.
- Add a short follow-up section only when the topic naturally has extra questions.
- Keep author and editor context visible for the Robertito column.
- Cite or link to related internal posts where it helps establish topical depth.

### Success Checks

- Key posts can be summarized accurately from the first screen of content.
- Posts contain extractable definitions, criteria, and examples.
- GA4 referral reports include AI/search referrers over time, such as `chatgpt.com`, `perplexity.ai`, and Google organic search.

## Publishing Checklist

Before publishing a new post:

- The title matches a real query or a clear editorial angle.
- The excerpt states the useful promise of the post.
- The first screen contains the answer or thesis.
- Headings are descriptive when read out of context.
- The post links to related internal content when available.
- The post has tags from an existing cluster.
- `bundle exec jekyll build` passes.

## First Implementation Pass

- Add this plan to the repo.
- Add `robots.txt`.
- Add `llms.txt`.
- Replace Universal Analytics with GA4.
- Improve "The boring stack wins" with answer-first structure and a follow-up section.
- Build locally and inspect generated output.

Status: implemented locally.

Search Console API check is blocked because the Google Cloud project has `searchconsole.googleapis.com` disabled. Enable that API before using the service account to inspect Search Console sites, query data, or sitemap status.

## Later Work

- Set up or verify Search Console access for `1ma.dev`.
- Refresh the older Dokku, process-by-port, AWS bill, and side-project posts.
- Add cluster index pages once the taxonomy is clearer.
- Review Search Console and GA4 monthly and adjust the editorial backlog from real queries.
