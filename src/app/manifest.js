export default function manifest() {
  return {
    name: 'Board Game Events',
    short_name: 'BG Events',
    description: 'Find your next board game night, or host one yourself.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf7ef',
    theme_color: '#ed520d',
    icons: [
      {
        src: '/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
