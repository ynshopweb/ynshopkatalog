// Logika halaman katalog (customer) - hanya membaca data dari Firestore
import {
  db, isFirebaseConfigured, collection, doc, onSnapshot,
  PRODUCTS_COL, SETTINGS_COL, SETTINGS_DOC,
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
};

const $ = (id) => document.getElementById(id);

// ---------- Helper data ----------
function getVariants(p) {
  return p.variants?.length ? p.variants : [{ name: 'Utama', img: p.mainImg }];
}

function toMillis(ts) {
  return ts?.toMillis ? ts.toMillis() : 0;
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
function renderVariantThumbs() {
  const variants = getVariants(state.active);
  const box = $('detailVariantThumbnails');
  box.innerHTML = '';

  variants.forEach((v, idx) => {
    const btn = document.createElement('button');
    const vOut = variantStock(v, state.active) <= 0;
    btn.title = `${v.name} (${vOut ? 'Habis' : 'Stok ' + variantStock(v, state.active)})`;
    btn.className = `relative w-12 h-12 rounded-xl overflow-hidden border-2 transition flex-shrink-0 ${
      idx === state.variantIdx ? 'border-brand-pink ring-2 ring-pink-200' : 'border-transparent opacity-70 hover:opacity-100'
    } ${vOut ? 'grayscale' : ''}`;
    btn.innerHTML = `<img src="${escapeHtml(safeUrl(v.img) || IMG_FALLBACK)}" alt="${escapeHtml(v.name)}" class="w-full h-full object-cover">`;
    btn.addEventListener('click', () => {
      state.variantIdx = idx;
      renderVariantThumbs();
      renderDetailImage();
    });
    box.appendChild(btn);
  });
  attachImgFallback(box);
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

  onSnapshot(
    collection(db, PRODUCTS_COL),
    (snap) => {
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
    if (card) openProductDetail(card.dataset.id);
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
