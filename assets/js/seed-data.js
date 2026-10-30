// Data contoh (dipakai tombol "Isi Data Contoh" di halaman admin)
export const SEED_BRANDS = ['Emina', 'OMG', 'Glad2Glow', 'Skintific', 'Madame Gie'];

export const SEED_PRODUCTS = [
  {
    title: 'Emina Bright Stuff Face Wash 100ml',
    brand: 'Emina',
    price: 28500,
    originalPrice: 35000,
    stock: 15,
    mainImg: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    variants: [
      { name: 'Ukuran 100ml', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80' },
      { name: 'Ukuran 50ml', img: 'https://images.unsplash.com/photo-1608248597261-e4d091026310?auto=format&fit=crop&w=600&q=80' },
    ],
    description: 'Sabun pembersih wajah dengan kandungan ekstrak Summer Plum dan Vitamin B3 yang mampu membersihkan kotoran dan membuat kulit tampak cerah berseri.',
  },
  {
    title: 'OMG Oh My Glam Matte Last Lip Cream',
    brand: 'OMG',
    price: 22000,
    stock: 8,
    mainImg: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80',
    variants: [
      { name: 'Shade 01 Latte', img: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80' },
      { name: 'Shade 02 Peach', img: 'https://images.unsplash.com/photo-1625093742435-6fa192b6fb1a?auto=format&fit=crop&w=600&q=80' },
      { name: 'Shade 03 Berry', img: 'https://images.unsplash.com/photo-1599948128020-9a44505b0d1b?auto=format&fit=crop&w=600&q=80' },
    ],
    description: 'Lip cream matte dengan warna yang intens dan tahan lama sepanjang hari. Formula transferproof dan mengandung Jojoba Oil & Vitamin E.',
  },
  {
    title: 'Glad2Glow Blueberry 5% Ceramide Moisturizer',
    brand: 'Glad2Glow',
    price: 49000,
    stock: 20,
    mainImg: 'https://images.unsplash.com/photo-1617897903246-719242758050?auto=format&fit=crop&w=600&q=80',
    variants: [
      { name: 'Jar 30g', img: 'https://images.unsplash.com/photo-1617897903246-719242758050?auto=format&fit=crop&w=600&q=80' },
    ],
    description: 'Moisturizer dengan ekstrak Blueberry dan Ceramide yang berfungsi untuk merawat kemerahan, menghaluskan tekstur kulit, dan menjaga skin barrier.',
  },
  {
    title: 'Skintific 5X Ceramide Barrier Repair Moisture Gel',
    brand: 'Skintific',
    price: 139000,
    originalPrice: 169000,
    stock: 5,
    mainImg: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80',
    variants: [
      { name: 'Size 30g', img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80' },
      { name: 'Size 80g', img: 'https://images.unsplash.com/photo-1608248597261-e4d091026310?auto=format&fit=crop&w=600&q=80' },
    ],
    description: 'Moisturizer yang menggabungkan 3 kandungan aktif Ceramide, Hyaluronic Acid, dan Centella Asiatica untuk mengatasi permasalahan skin barrier yang rusak.',
  },
  {
    title: 'Madame Gie Protect Me Sunscreen SPF 30 PA+++',
    brand: 'Madame Gie',
    price: 29000,
    stock: 0,
    mainImg: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80',
    variants: [
      { name: 'Tube 60ml', img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80' },
    ],
    description: 'Sunscreen yang melindungi kulit dari paparan sinar UV sekaligus melembapkan kulit dengan formula ringan dan cepat meresap.',
  },
];
