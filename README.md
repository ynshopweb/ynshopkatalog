# YnShop - Katalog Skincare & Cosmetic

Website katalog statis (HTML + JS) dengan **Firebase** (Firestore + Authentication) dan siap deploy di **Vercel**.

- `/` : katalog untuk customer (hanya bisa melihat)
- `/admin` : halaman pengelola toko, wajib login (tidak ada tautan ke sini dari katalog)

## Struktur Folder

```
ynshop/
├── index.html              # Katalog customer
├── admin/
│   └── index.html          # Halaman admin (login + dashboard)
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── firebase.js         # <-- ISI CONFIG FIREBASE DI SINI
│       ├── tailwind-config.js  # Warna & font brand
│       ├── utils.js            # Fungsi bantuan bersama
│       ├── catalog.js          # Logika katalog
│       ├── admin.js            # Logika admin
│       └── seed-data.js        # Data contoh
├── firestore.rules         # Aturan keamanan Firestore
├── vercel.json
└── README.md
```

## 1. Siapkan Firebase

1. Buka [Firebase Console](https://console.firebase.google.com) > **Add project**.
2. **Build > Firestore Database > Create database** (pilih lokasi terdekat, mis. `asia-southeast2` Jakarta).
3. **Build > Authentication > Get started > Sign-in method > Email/Password > Enable**.
4. Tab **Users > Add user**: buat email & password untuk admin toko.
5. **Project settings (ikon gear) > Your apps > Web (`</>`)** > daftarkan app, lalu salin `firebaseConfig`.
6. Tempel config tersebut ke `assets/js/firebase.js`.

## 2. Pasang Aturan Keamanan (penting!)

Buka `firestore.rules`, ganti `GANTI_DENGAN_EMAIL_ADMIN@gmail.com` dengan email admin dari langkah 1.4.
Lalu salin seluruh isinya ke **Firestore Database > Rules > Publish**.

Dengan aturan ini customer hanya bisa **membaca** produk, sedangkan tambah/edit/hapus hanya bisa dilakukan akun admin yang login. Menyembunyikan halaman `/admin` saja tidak cukup; aturan inilah yang benar-benar melindungi data.

## 3. Coba di Komputer

Karena memakai ES module, file tidak bisa dibuka langsung dengan klik dua kali. Jalankan server lokal:

```bash
npx serve .
```

Buka `http://localhost:3000` (katalog) dan `http://localhost:3000/admin` (admin).
Login di `/admin`, lalu klik **Isi Data Contoh** (jika masih kosong) atau **Tambah Produk**.
Atur nomor WhatsApp lewat tombol **No. WA Toko**.

> Jika login gagal di localhost: Authentication > Settings > **Authorized domains** biasanya sudah memuat `localhost`.

## 4. Deploy ke Vercel

**Lewat GitHub (disarankan)**
1. Upload folder ini ke repository GitHub.
2. Di [vercel.com](https://vercel.com) > **Add New > Project** > pilih repo.
3. Framework Preset: **Other**. Build command & output directory dibiarkan kosong. Klik **Deploy**.

**Lewat CLI**
```bash
npm i -g vercel
vercel --prod
```

Setelah deploy, **tambahkan domain Vercel ke Firebase**:
Authentication > Settings > **Authorized domains** > Add domain (mis. `ynshop.vercel.app` dan domain custom jika ada). Tanpa ini, login admin akan ditolak di situs online.

## Urutan Produk di Katalog

Produk di katalog tidak lagi diurutkan hanya berdasarkan waktu input, tetapi berdasarkan **rekomendasi**:

- **Stok banyak** dan **sering dibuka/dicari** customer tampil lebih dulu. Skor = 60% popularitas (jumlah klik + 3x jumlah pencarian) + 40% stok (stok di atas 50 dianggap sama).
- Produk yang **stoknya habis selalu di paling bawah**.
- Saat customer mengetik pencarian, produk yang **namanya cocok** didahulukan.
- Klik dan pencarian dicatat di koleksi `stats` (satu dokumen per produk: `clicks`, `searches`). Satu produk dihitung **sekali per browser per 12 jam**. "Pencarian" dihitung ketika customer membuka produk saat kolom pencarian sedang terisi.
- Aturan Firestore yang baru **wajib dipublikasikan ulang** (salin `firestore.rules` ke Firebase Console > Firestore > Rules > Publish). Tanpa itu katalog tetap jalan, tetapi diurutkan hanya berdasarkan stok dan klik tidak tersimpan.
- Untuk mengatur ulang statistik, hapus dokumen di koleksi `stats` lewat Firebase Console.

## Catatan

- **Gambar produk** memakai URL (sama seperti versi sebelumnya). Firebase Storage sekarang membutuhkan paket berbayar (Blaze), jadi tidak dipakai di sini. Alternatifnya, unggah gambar ke layanan gratis seperti Cloudinary/ImgBB lalu tempel URL-nya.
- Tailwind dimuat lewat CDN agar tanpa proses build. Untuk performa maksimal di produksi, bisa dimigrasikan ke Tailwind CLI nanti.
- Data tersimpan di Firestore (koleksi `products` dan dokumen `settings/store`) dan tampil real-time di katalog.
