alter table public.posts
  alter column html_body drop not null;

alter table public.posts
  add constraint posts_html_body_required_for_ready_published
  check (
    content_status not in ('ready', 'published')
    or (html_body is not null and btrim(html_body) <> '')
  );
