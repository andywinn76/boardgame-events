'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function grantRole(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userId = formData.get('user_id');
  const role = formData.get('role');

  const { error } = await supabase.rpc('grant_role', { _user: userId, _role: role });

  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/users');
}

export async function revokeRole(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userId = formData.get('user_id');
  const role = formData.get('role');

  const { error } = await supabase.rpc('revoke_role', { _user: userId, _role: role });

  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/users');
}

export async function resolveReport(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const reportId = formData.get('report_id');

  const { error } = await supabase
    .from('reports')
    .update({ resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', reportId);

  if (error) {
    redirect(`/admin/reports?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/reports');
}

export async function adminCancelEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const eventId = formData.get('event_id');
  const reason = formData.get('reason');

  if (!reason?.trim()) {
    redirect(`/admin/events?error=${encodeURIComponent('A cancellation reason is required')}`);
  }

  const { error } = await supabase.rpc('cancel_event', { _event: eventId, _reason: reason });

  if (error) {
    redirect(`/admin/events?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/events');
}
