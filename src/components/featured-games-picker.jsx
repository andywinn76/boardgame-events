'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { CircleHelp, LoaderCircle, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const MAX_FEATURED_GAMES = 5;

function FeaturedGamesInfo() {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label="What are featured games?"
        aria-describedby="featured-games-help"
        className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-3.5" />
      </button>
      <span
        id="featured-games-help"
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs font-normal leading-relaxed text-background shadow-lg group-hover:block group-focus-within:block"
      >
        Featured games will let hosts highlight up to five planned games using BoardGameGeek details and box art. BoardGameGeek API access is still pending.
      </span>
    </span>
  );
}

export function FeaturedGamesPicker({ defaultEnabled = false, initialGames = [] }) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(initialGames);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!enabled || trimmedQuery.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const response = await fetch(`/api/bgg/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not search BoardGameGeek.');
        setResults(payload.games || []);
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 600);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, query]);

  async function addGame(result) {
    if (selected.length >= MAX_FEATURED_GAMES || selected.some((game) => game.bgg_id === result.bggId)) return;

    setAddingId(result.bggId);
    setError('');
    try {
      const response = await fetch(`/api/bgg/games/${result.bggId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load that game.');
      setSelected((games) => [...games, payload.game]);
      setQuery('');
      setResults([]);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <fieldset className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span>
            Featured games <span className="font-normal text-muted-foreground">(optional, coming soon)</span>
          </span>
          <FeaturedGamesInfo />
        </span>
      </legend>

      <input type="hidden" name="featured_games" value={JSON.stringify(selected.map((game) => game.bgg_id))} />

      <div className="flex items-center gap-2">
        <input
          id="featured_games_enabled"
          name="featured_games_enabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setQuery('');
            setResults([]);
            setSearching(false);
            setError('');
          }}
          className="size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="featured_games_enabled" className="font-normal">
          Enable featured games for this event
        </Label>
      </div>

      {enabled && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Add up to five games. Game details and box art come from BoardGameGeek.</p>

          {selected.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {selected.map((game) => (
                <li key={game.bgg_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                  {game.thumbnail_url ? (
                    <Image
                      src={game.thumbnail_url}
                      alt={`${game.name} box art`}
                      width={48}
                      height={48}
                      className="size-12 rounded object-contain"
                    />
                  ) : (
                    <div className="size-12 rounded bg-muted" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{game.name}</p>
                    {game.year_published && <p className="text-xs text-muted-foreground">{game.year_published}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${game.name}`}
                    onClick={() => setSelected((games) => games.filter((item) => item.bgg_id !== game.bgg_id))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {selected.length < MAX_FEATURED_GAMES && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  if (nextQuery.trim().length < 3) {
                    setResults([]);
                    setSearching(false);
                  }
                }}
                placeholder="Search BoardGameGeek"
                className="pl-8"
                autoComplete="off"
              />
            </div>
          )}

          {searching && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" /> Searching BoardGameGeek…
            </p>
          )}

          {!searching && results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-1">
              {results.map((result) => {
                const alreadySelected = selected.some((game) => game.bgg_id === result.bggId);
                return (
                  <li key={result.bggId}>
                    <button
                      type="button"
                      disabled={alreadySelected || addingId !== null}
                      onClick={() => addGame(result)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span>{result.name}</span>
                      <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                        {addingId === result.bggId ? 'Loading…' : result.yearPublished || 'Year unknown'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-xs text-muted-foreground">
            {selected.length} of {MAX_FEATURED_GAMES} selected ·{' '}
            <a href="https://boardgamegeek.com" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
              Game data from BoardGameGeek
            </a>
          </p>
        </div>
      )}
    </fieldset>
  );
}
