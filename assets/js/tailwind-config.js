// Konfigurasi Tailwind (dimuat setelah script Tailwind CDN)
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#E12A5E',
          pinkLight: '#FFF0F5',
          pinkHover: '#C61E4E',
          yellow: '#FFD02C',
          dark: '#2D1B28',
        },
      },
      fontFamily: {
        heading: ['Fredoka', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
};
