import { createClient } from '@/lib/supabase/server';
import { getBggGames } from '@/lib/bgg';

export async function GET(_request, { params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: 'Sign in to select games.' }, { status: 401 });

  const { id } = await params;
  const bggId = Number(id);
  if (!Number.isInteger(bggId) || bggId <= 0) {
    return Response.json({ error: 'Invalid BoardGameGeek game ID.' }, { status: 400 });
  }

  try {
    const [game] = await getBggGames([bggId]);
    return game ? Response.json({ game }) : Response.json({ error: 'Game not found.' }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 503 });
  }
}
