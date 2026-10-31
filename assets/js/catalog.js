// Logika halaman katalog (customer) - hanya membaca data dari Firestore
import {
  db, isFirebaseConfigured, collection, doc, onSnapshot, getDocs, setDoc, increment, serverTimestamp,
  PRODUCTS_COL, SETTINGS_COL, SETTINGS_DOC, STATS_COL,
} from './firebase.js';
import {
  DEFAULT_WA, IMG_FALLBACK, escapeHtml, safeUrl, formatRupiah, cleanPhone,
  stockInfo, priceInfo, variantStock, totalStock, attachImgFallback, openModal, closeModal, enableModalDismiss,
  showToast, mergeBrands,
} from './utils.js';

const state = {
  products: [],
  settingsBrands: [],
  whatsapp: DEFAULT_WA,
  selectedBrand: 'Semua',
  search: '',
  active: null,        // produk yang sedang dibuka
  variantIdx: 0,       // varian yang sedang dipilih
  stats: {},           // { [productId]: { clicks, searches } } - dibaca sekali per kunjungan
};

const $ = (id) => document.getElementById(id);

// ---------- Helper data ----------
function getVariants(p) {
  return p.variants?.length ? p.variants : [{ name: 'Utama', img: p.mainImg }];
}

function toMillis(ts) {
  return ts?.toMillis ? ts.toMillis() : 0;
}

// ---------- Urutan rekomendasi & statistik populer ----------
// Skor = 60% popularitas (klik + 3x pencarian, dibanding produk terpopuler)
//      + 40% stok (maks. dihitung 50 agar stok raksasa tidak mendominasi).
// Produk yang stoknya habis selalu di paling bawah. Seri diurutkan dari yang terbaru.
const STOCK_CAP = 50;
const W_POPULAR = 0.6;
const W_STOCK = 0.4;
const SEARCH_WEIGHT = 3;

function popularity(id) {
  const st = state.stats[id];
  return st ? st.clicks + SEARCH_WEIGHT * st.searches : 0;
}

function rankProducts(list, q) {
  const maxPop = Math.max(0, ...list.map((p) => popularity(p.id)));
  const score = (p) =>
    W_POPULAR * (maxPop ? popularity(p.id) / maxPop : 0) +
    W_STOCK * (Math.min(p.stock, STOCK_CAP) / STOCK_CAP);
  // Saat mencari: yang namanya cocok didahulukan, baru brand/varian/deskripsi
  const matchRank = (p) => (q && !p.title.toLowerCase().includes(q) ? 1 : 0);

  // sort() stabil, jadi urutan awal (terbaru dulu) menjadi penentu saat skor sama
  return list.sort((a, b) =>
    (a.stock <= 0) - (b.stock <= 0) ||
    matchRank(a) - matchRank(b) ||
    score(b) - score(a)
  );
}

async function loadStats() {
  try {
    const snap = await Promise.race([
      getDocs(collection(db, STATS_COL)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    const stats = {};
    snap.docs.forEach((d) => {
      const x = d.data();
      stats[d.id] = { clicks: Number(x.clicks) || 0, searches: Number(x.searches) || 0 };
    });
    state.stats = stats;
  } catch (err) {
    // Katalog tetap jalan (diurutkan berdasarkan stok) bila statistik tidak bisa dibaca
    console.warn('Statistik populer tidak tersedia:', err.message || err);
  }
}

// Satu browser hanya dihitung sekali per produk per 12 jam (mengurangi klik berulang/spam)
const COUNT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const SEEN_KEY = 'ynshop_counted';

function takeCount(kind, id) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    const key = `${kind}:${id}`;
    const now = Date.now();
    if (seen[key] && now - seen[key] < COUNT_COOLDOWN_MS) return 0;
    seen[key] = now;
    // buang catatan kadaluarsa
    Object.keys(seen).forEach((k) => { if (now - seen[k] > COUNT_COOLDOWN_MS) delete seen[k]; });
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    return 1;
  } catch {
    return 1; // penyimpanan browser diblokir: tetap hitung
  }
}

// Produk dibuka = +1 klik. Jika customer sedang mengetik pencarian = +1 pencarian juga.
function trackProductOpen(id) {
  if (!isFirebaseConfigured) return;
  const clicks = takeCount('c', id);
  const searches = state.search.trim().length >= 2 ? takeCount('s', id) : 0;
  if (!clicks && !searches) return;
  setDoc(
    doc(db, STATS_COL, id),
    { clicks: increment(clicks), searches: increment(searches), updatedAt: serverTimestamp() },
    { merge: true }
  ).catch((err) => console.debug('Statistik tidak tersimpan:', err.code || err));
}

// ---------- Render ----------
function renderBrandFilters() {
  // Customer hanya melihat brand yang sudah punya produk
  const brands = ['Semua', ...mergeBrands([], state.products)];
  if (!brands.includes(state.selectedBrand)) state.selectedBrand = 'Semua';

  const box = $('brandFilterContainer');
  box.innerHTML = '';
  brands.forEach((brand) => {
    const active = brand === state.selectedBrand;
    const btn = document.createElement('button');
    btn.className = `px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${
      active
        ? 'bg-brand-pink text-white shadow-md shadow-pink-200'
        : 'bg-pink-50 text-gray-700 hover:bg-pink-100 border border-pink-100'
    }`;
    btn.textContent = brand;
    btn.addEventListener('click', () => {
      state.selectedBrand = brand;
      renderBrandFilters();
      renderProducts();
    });
    box.appendChild(btn);
  });
}

function renderSkeleton() {
  $('productGrid').innerHTML = Array.from({ length: 10 }, () => `
    <div class="bg-white rounded-3xl overflow-hidden border border-pink-100/80">
      <div class="aspect-square skeleton"></div>
      <div class="p-4 space-y-2">
        <div class="h-3 w-4/5 rounded skeleton"></div>
        <div class="h-4 w-1/2 rounded skeleton"></div>
      </div>
    </div>`).join('');
}

function renderProducts() {
  const grid = $('productGrid');
  const q = state.search.toLowerCase().trim();

  $('catalogTitle').textContent =
    state.selectedBrand === 'Semua' ? 'Semua Produk' : `Brand: ${state.selectedBrand}`;

  const filtered = state.products.filter((p) => {
    const okBrand = state.selectedBrand === 'Semua' || p.brand.toLowerCase() === state.selectedBrand.toLowerCase();
    const okSearch = !q ||
      p.title.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      getVariants(p).some((v) => v.name.toLowerCase().includes(q));
    return okBrand && okSearch;
  });

  rankProducts(filtered, q);

  $('productCount').textContent = `${filtered.length} Produk ditemukan`;
  $('emptyState').classList.toggle('hidden', filtered.length > 0);

  grid.innerHTML = filtered.map((p) => {
    const s = stockInfo(p.stock);
    const pr = priceInfo(p);
    return `
      <article data-id="${escapeHtml(p.id)}" class="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl border border-pink-100/80 transition-all duration-300 flex flex-col group cursor-pointer hover:-translate-y-1">
        <div class="relative aspect-square overflow-hidden bg-pink-50">
          <img src="${escapeHtml(safeUrl(p.mainImg) || IMG_FALLBACK)}" alt="${escapeHtml(p.title)}" loading="lazy"
            class="w-full h-full object-cover group-hover:scale-105 transition duration-500 ${s.out ? 'opacity-70' : ''}">
          <span class="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-white/90 text-brand-pink shadow-sm backdrop-blur-sm">${escapeHtml(p.brand)}</span>
          <span class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm ${s.cls}">${escapeHtml(s.label)}</span>
          ${pr.onSale ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-yellow text-brand-dark shadow-sm">-${pr.discount}%</span>` : ''}
        </div>
        <div class="p-3 sm:p-4 flex flex-col flex-grow justify-between">
          <h3 class="font-heading text-xs sm:text-sm font-semibold text-gray-800 line-clamp-2 mb-1 group-hover:text-brand-pink transition">${escapeHtml(p.title)}</h3>
          <div class="mt-2 pt-2 border-t border-pink-50 flex items-center justify-between">
            <div class="leading-tight">
              ${pr.onSale ? `<span class="block text-[11px] text-gray-400 line-through">Rp ${formatRupiah(pr.original)}</span>` : ''}
              <span class="text-sm sm:text-base font-extrabold text-brand-pink">Rp ${formatRupiah(pr.price)}</span>
            </div>
            <span class="w-7 h-7 rounded-full bg-pink-100 text-brand-pink flex items-center justify-center text-xs group-hover:bg-brand-pink group-hover:text-white transition"><i class="fa-solid fa-eye"></i></span>
          </div>
        </div>
      </article>`;
  }).join('');

  attachImgFallback(grid);
}

// ---------- Detail produk ----------
// Pilihan varian: <=5 varian = baris (flex), >5 varian = grid yang otomatis turun baris.
// Tidak ada batas jumlah dan tidak ada scroll horizontal; halaman/modal yang digulir ke bawah.
function renderVariantThumbs() {
  const p = state.active;
  const variants = getVariants(p);
  const box = $('detailVariantThumbnails');

  box.className = variants.length > 5 ? 'variant-grid' : 'variant-list';
  $('detailVariantCount').textContent = `(${variants.length})`;
  box.innerHTML = '';

  variants.forEach((v, idx) => {
    const qty = variantStock(v, p);
    const out = qty <= 0;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.idx = idx;
    btn.className = `variant-item${out ? ' is-out' : ''}`;
    btn.title = `${v.name} - ${out ? 'Habis' : 'Stok ' + qty}`;
    btn.innerHTML = `
      <span class="variant-thumb">
        <img src="${escapeHtml(safeUrl(v.img) || IMG_FALLBACK)}" alt="" loading="lazy">
        ${out ? '<span class="variant-soldout">Habis</span>' : ''}
      </span>
      <span class="variant-name">${escapeHtml(v.name)}</span>`;
    btn.addEventListener('click', () => selectVariant(idx));
    box.appendChild(btn);
  });

  attachImgFallback(box);
  markSelectedVariant();
}

// Ganti penanda pilihan tanpa membangun ulang daftar (posisi scroll & fokus tetap)
function markSelectedVariant() {
  $('detailVariantThumbnails').querySelectorAll('.variant-item').forEach((btn) => {
    const selected = Number(btn.dataset.idx) === state.variantIdx;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', String(selected));
  });
}

function selectVariant(idx) {
  state.variantIdx = idx;
  markSelectedVariant();
  renderDetailImage(); // memperbarui gambar utama, nama varian, badge stok & tombol WA
}

function renderDetailImage() {
  const v = getVariants(state.active)[state.variantIdx];
  const img = $('detailMainImg');
  img.onerror = () => { img.onerror = null; img.src = IMG_FALLBACK; };
  img.src = safeUrl(v.img) || IMG_FALLBACK;
  img.alt = `${state.active.title} - ${v.name}`;
  $('selectedVariantText').textContent = v.name || 'Utama';
  updateStockBadge();
}

// Stok mengikuti varian yang sedang dipilih
function updateStockBadge() {
  const p = state.active;
  const v = getVariants(p)[state.variantIdx];
  const s = stockInfo(variantStock(v, p));
  const badge = $('detailStockBadge');
  badge.className = `absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold text-white shadow ${s.cls}`;
  badge.textContent = s.detail;
  $('btnOrderText').textContent = s.out ? 'Tanya Ketersediaan Via WA' : 'Pesan Sekarang Via WA';
  // Umpan balik dekat daftar varian (di HP, gambar utama bisa sudah tergulir ke atas)
  $('variantSelectedInline').textContent = `Dipilih: ${v.name} \u00b7 ${s.detail}`;
}

function openProductDetail(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;

  state.active = p;
  state.variantIdx = 0;

  $('detailTitle').textContent = p.title;
  $('detailBrand').textContent = p.brand;
  const pr = priceInfo(p);
  $('detailPrice').textContent = `Rp ${formatRupiah(pr.price)}`;
  $('detailPromo').classList.toggle('hidden', !pr.onSale);
  if (pr.onSale) {
    $('detailOriginalPrice').textContent = `Rp ${formatRupiah(pr.original)}`;
    $('detailDiscount').textContent = `Hemat ${pr.discount}%`;
  }
  $('detailDescription').textContent = p.description || 'Tidak ada deskripsi.';

  renderDetailImage();
  renderVariantThumbs();
  openModal('productDetailModal');
}

// ---------- WhatsApp ----------
function openWhatsapp(text) {
  const number = cleanPhone(state.whatsapp);
  if (!number) {
    showToast('Nomor WhatsApp toko belum diatur.', 'error');
    return;
  }
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function orderViaWhatsapp() {
  const p = state.active;
  if (!p) return;
  const v = getVariants(p)[state.variantIdx];
  const pr = priceInfo(p);
  openWhatsapp(
    `Halo YnShop, saya mau pesan produk ini:\n\n` +
    `*Nama Produk:* ${p.title}\n` +
    `*Brand:* ${p.brand}\n` +
    `*Varian:* ${v.name}\n` +
    `*Harga:* Rp ${formatRupiah(pr.price)}` +
    (pr.onSale ? ` (promo, normal Rp ${formatRupiah(pr.original)})` : '') + `\n\n` +
    `Apakah stok masih tersedia? Terima kasih!`
  );
}

// ---------- Download gambar ----------
function downloadCurrentImage() {
  if (!state.active) return;
  const src = $('detailMainImg').src;
  const filename = `${state.active.title.replace(/[^a-zA-Z0-9]/g, '_')}_YnShop.jpg`;
  showToast('Mengunduh gambar produk...');

  fetch(src)
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Gambar berhasil diunduh!');
    })
    .catch(() => {
      window.open(src, '_blank', 'noopener');
      showToast('Gambar dibuka di tab baru untuk disimpan.');
    });
}

// ---------- Data realtime dari Firestore ----------
function showError(message) {
  $('productGrid').innerHTML = '';
  $('emptyState').classList.add('hidden');
  $('productCount').textContent = '';
  $('errorMsg').textContent = message;
  $('errorState').classList.remove('hidden');
}

function startListening() {
  if (!isFirebaseConfigured) {
    showError('Firebase belum dikonfigurasi. Isi config di assets/js/firebase.js.');
    return;
  }

  const statsReady = loadStats(); // dibaca sekali; tampilan pertama menunggu agar urutan tidak melompat

  onSnapshot(
    collection(db, PRODUCTS_COL),
    async (snap) => {
      await statsReady;
      $('errorState').classList.add('hidden');
      state.products = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .map((p) => ({
          ...p,
          title: p.title || '',
          brand: p.brand || '',
          stock: totalStock(p),
          price: Number(p.price) || 0,
        }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      renderBrandFilters();
      renderProducts();

      // Jika modal sedang terbuka, segarkan datanya (mis. stok berubah)
      if (state.active) {
        const fresh = state.products.find((p) => p.id === state.active.id);
        if (fresh && !$('productDetailModal').classList.contains('hidden')) {
          const idx = state.variantIdx;
          openProductDetail(fresh.id);
          state.variantIdx = Math.min(idx, getVariants(fresh).length - 1);
          renderVariantThumbs();
          renderDetailImage();
        }
      }
    },
    (err) => {
      console.error(err);
      showError('Tidak dapat mengambil data produk. Periksa koneksi atau aturan Firestore.');
    }
  );

  onSnapshot(doc(db, SETTINGS_COL, SETTINGS_DOC), (snap) => {
    const data = snap.exists() ? snap.data() : {};
    state.whatsapp = data.whatsappNumber || DEFAULT_WA;
    state.settingsBrands = Array.isArray(data.brands) ? data.brands : [];
    renderBrandFilters();
  });
}

// ---------- Init ----------
function init() {
  $('year').textContent = new Date().getFullYear();

  $('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });

  $('productGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) {
      openProductDetail(card.dataset.id);
      trackProductOpen(card.dataset.id);
    }
  });

  $('btnCloseDetail').addEventListener('click', () => closeModal('productDetailModal'));
  $('btnOrder').addEventListener('click', orderViaWhatsapp);
  $('btnDownload').addEventListener('click', downloadCurrentImage);
  $('btnContact').addEventListener('click', () =>
    openWhatsapp('Halo YnShop, saya ingin bertanya seputar produk skincare & kosmetik.')
  );

  enableModalDismiss(['productDetailModal']);

  renderSkeleton();
  startListening();
}

init();
