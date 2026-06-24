---
layout: default
title: Topics
permalink: /tags/
---

<section class="taxonomy-page" aria-labelledby="topics-title">
  <header class="taxonomy-header">
    <p class="home-kicker">Topics</p>
    <h1 id="topics-title">A cleaner map of the blog.</h1>
    <p>
      Start with the recurring themes: practical software, Ruby and Rails,
      operations, side projects, and field notes from the work around the work.
    </p>
  </header>

  <section class="start-here" aria-labelledby="start-here-title">
    <h2 id="start-here-title">Start here</h2>
    <div class="start-here-grid">
      {% assign start_tags = "software,ops,anecdote" | split: "," %}
      {% for start_tag in start_tags %}
        {% assign post = site.tags[start_tag] | first %}
        {% if post %}
        <a href="{{ site.baseurl }}{{ post.url }}">
          <span>
            {% if post.tags[0] %}#{{ post.tags[0] }}{% else %}Article{% endif %}
          </span>
          <strong>{{ post.title }}</strong>
        </a>
        {% endif %}
      {% endfor %}
    </div>
  </section>

  <section class="posts-by-topic" aria-labelledby="posts-by-topic-title">
    <h2 id="posts-by-topic-title">Posts by topic</h2>
    <ul class="taxonomy-list">
    {% for tag in site.data.taxonomy.tags %}
      {% assign posts = site.tags[tag.slug] %}
      {% if posts %}
      <li>
        <div class="taxonomy-topic">
          <a class="taxonomy-topic-main" href="/tag/{{ tag.slug }}/">
            <strong>#{{ tag.label }}</strong>
            <span>{{ tag.description }}</span>
            <em>{{ posts | size }} posts</em>
          </a>
          <div class="taxonomy-topic-posts">
            {% for post in posts limit: 2 %}
              <a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a>
            {% endfor %}
          </div>
        </div>
      </li>
      {% endif %}
    {% endfor %}
    </ul>
  </section>
</section>
