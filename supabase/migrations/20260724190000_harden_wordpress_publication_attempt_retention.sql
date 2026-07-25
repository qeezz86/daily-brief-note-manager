-- Phase 5C-R2: retain WordPress external-side-effect audit rows when content deletion is attempted.

alter table public.wordpress_publication_attempts
  drop constraint wordpress_publication_attempts_post_owner_fkey;

alter table public.wordpress_publication_attempts
  add constraint wordpress_publication_attempts_post_owner_fkey
  foreign key (content_id, owner_id)
  references public.posts (id, owner_id)
  on delete restrict;

comment on constraint wordpress_publication_attempts_post_owner_fkey
on public.wordpress_publication_attempts is
  'Retains WordPress draft audit and idempotency history; archive content instead of deleting it while attempts exist.';
