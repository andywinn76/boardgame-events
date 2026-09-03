export function UserAvatar({ avatarUrl, name, className = 'size-8' }) {
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary ${className}`}>
      {/* Avatar URLs are user-controlled Supabase public URLs; the local SVG is the standard fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl || '/avatar-placeholder.svg'}
        alt={name ? `${name}'s avatar` : 'User avatar'}
        className="size-full object-cover"
      />
    </span>
  );
}
