'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function claimInvite(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = formData.get('token');

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invites/${token}`)}`);
  }

  const { data: slug, error } = await supabase.rpc('claim_event_invite', { _token: token });

  if (error) {
    redirect(`/invites/${token}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/events/${slug}`);
}
