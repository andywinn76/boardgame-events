const BGG_BASE_URL = 'https://boardgamegeek.com/xmlapi2';

function decodeXml(value = '') {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attribute(tag, name) {
  return decodeXml(tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
}

function childValue(body, tagName) {
  const tag = body.match(new RegExp(`<${tagName}\\b[^>]*>`))?.[0];
  return tag ? attribute(tag, 'value') : '';
}

function childText(body, tagName) {
  return decodeXml(body.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`))?.[1]?.trim() || '');
}

function numberOrNull(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function bggFetch(path, revalidate) {
  const token = process.env.BGG_API_TOKEN;
  if (!token) {
    throw new Error('BoardGameGeek search is not configured yet. Add BGG_API_TOKEN to the server environment.');
  }

  const response = await fetch(`${BGG_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429 || response.status >= 500
        ? 'BoardGameGeek is busy. Please wait a moment and try again.'
        : `BoardGameGeek request failed (${response.status}).`
    );
  }

  return response.text();
}

export async function searchBggGames(query) {
  const xml = await bggFetch(`/search?query=${encodeURIComponent(query)}&type=boardgame`, 86400);
  const results = [];

  for (const match of xml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
    const id = numberOrNull(attribute(match[1], 'id'));
    const body = match[2];
    const nameTag = body.match(/<name\b[^>]*type="primary"[^>]*\/>/)?.[0] || body.match(/<name\b[^>]*\/>/)?.[0];
    const name = nameTag ? attribute(nameTag, 'value') : '';
    if (id && name) {
      results.push({ bggId: id, name, yearPublished: numberOrNull(childValue(body, 'yearpublished')) });
    }
    if (results.length === 20) break;
  }

  return results;
}

export async function getBggGames(ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 5);
  if (!uniqueIds.length) return [];

  const xml = await bggFetch(`/thing?id=${uniqueIds.join(',')}&stats=1`, 2592000);
  const games = [];

  for (const match of xml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
    const bggId = numberOrNull(attribute(match[1], 'id'));
    const body = match[2];
    const nameTag = body.match(/<name\b[^>]*type="primary"[^>]*\/>/);
    const name = nameTag ? attribute(nameTag[0], 'value') : '';
    const ratingBody = body.match(/<ratings>([\s\S]*?)<\/ratings>/)?.[1] || '';
    if (!bggId || !name) continue;

    games.push({
      bgg_id: bggId,
      name,
      year_published: numberOrNull(childValue(body, 'yearpublished')),
      min_players: numberOrNull(childValue(body, 'minplayers')),
      max_players: numberOrNull(childValue(body, 'maxplayers')),
      playtime_minutes: numberOrNull(childValue(body, 'playingtime')),
      weight: numberOrNull(childValue(ratingBody, 'averageweight')),
      thumbnail_url: childText(body, 'thumbnail') || null,
      image_url: childText(body, 'image') || null,
    });
  }

  return uniqueIds.map((id) => games.find((game) => game.bgg_id === id)).filter(Boolean);
}
