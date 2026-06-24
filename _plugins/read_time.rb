module Jekyll
  class ReadTime < Generator
    safe true

    WORDS_PER_MIN = 180

    def generate(site)
      puts "\tJekyll ReadTime: Generating read time for posts"
      site.posts.docs.each do |post|
        post.data['read_time_in_minutes'] = read_time_in_minutes(post)
      end
    end

    private

    def read_time_in_minutes(post)
      minutes = post.content.split(" ").size.to_f / WORDS_PER_MIN.to_f
      minutes = 1 if minutes < 1
      minutes.round
    end
  end
end
