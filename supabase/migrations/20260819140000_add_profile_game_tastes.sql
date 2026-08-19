alter table public.profiles
  add column games_yes_please text
    check (games_yes_please is null or char_length(games_yes_please) between 1 and 1000),
  add column games_no_thanks text
    check (games_no_thanks is null or char_length(games_no_thanks) between 1 and 1000);
