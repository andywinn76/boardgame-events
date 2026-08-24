import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function isMissingCodeVerifier(error) {
  const message = error?.message?.toLowerCase() || '';
  return error?.name === 'AuthPKCECodeVerifierMissingError' || message.includes('code verifier');
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNext(searchParams.get('next'));
  const supabase = await createClient();
  let confirmationError = null;

  try {
    if (tokenHash && type === 'email') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      confirmationError = error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      confirmationError = error;
    }
  } catch (error) {
    confirmationError = error;
  }

  if ((tokenHash || code) && !confirmationError) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code && isMissingCodeVerifier(confirmationError)) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('confirmed', '1');
    if (next !== '/') loginUrl.searchParams.set('next', next);
    return NextResponse.redirect(loginUrl);
  }

  if (confirmationError) {
    console.error('Supabase account confirmation failed.', {
      code: confirmationError.code,
      message: confirmationError.message,
    });
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Could not confirm your account')}`
  );
}
