alter table public.profiles
  add column preferred_pronouns text
  check (preferred_pronouns is null or char_length(preferred_pronouns) between 1 and 80);
