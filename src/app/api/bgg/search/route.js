import { createClient } from '@/lib/supabase/server';
import { searchBggGames } from '@/lib/bgg';

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: 'Sign in to search for games.' }, { status: 401 });

  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 80) || '';
  if (query.length < 3) return Response.json({ games: [] });

  try {
    return Response.json({ games: await searchBggGames(query) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 503 });
  }
}
