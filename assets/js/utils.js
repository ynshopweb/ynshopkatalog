// Fungsi bantuan yang dipakai halaman katalog dan admin

export const DEFAULT_WA = '628123456789';

export const IMG_FALLBACK = 'https://placehold.co/400x400/FFF0F5/E12A5E?text=YnShop';

/** Mencegah XSS saat menyisipkan teks ke innerHTML */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hanya izinkan URL http/https (menolak javascript:, data:, dll) */
export function safeUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID').format(Number(number) || 0);
}

/**
 * Info harga: price = harga jual (promo), originalPrice = harga coret (opsional).
 * Dianggap promo hanya jika harga coret lebih besar dari harga jual.
 */
export function priceInfo(product) {
  const price = Number(product?.price) || 0;
  const original = Number(product?.originalPrice) || 0;
  const onSale = original > price && price >= 0;
  const discount = onSale ? Math.round(((original - price) / original) * 100) : 0;
  return { price, original: onSale ? original : 0, onSale, discount };
}

export function cleanPhone(value) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

/** Info label & warna badge stok */
export function stockInfo(stock) {
  const n = Number(stock) || 0;
  if (n <= 0) return { label: 'Habis', detail: 'Stok Habis', cls: 'bg-gray-400', out: true };
  if (n <= 5) return { label: `Stok Sisa ${n}`, detail: `Stok Menipis: ${n}`, cls: 'bg-amber-500', out: false };
  return { label: `Stok: ${n}`, detail: `Tersedia Stok: ${n}`, cls: 'bg-green-500', out: false };
}

/** Pasang gambar cadangan jika gambar gagal dimuat */
export function attachImgFallback(root, fallback = IMG_FALLBACK) {
  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => { img.src = fallback; }, { once: true });
  });
}

export function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/** Tutup modal saat klik area gelap atau tekan Escape */
export function enableModalDismiss(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ids.forEach(closeModal);
  });
}

let toastTimer;
export function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className =
      'fixed bottom-5 right-5 max-w-xs text-white px-4 py-3 rounded-2xl shadow-xl z-[60] text-xs flex items-center gap-2';
    document.body.appendChild(toast);
  }
  const icon = type === 'error' ? 'fa-circle-exclamation text-red-300' : 'fa-circle-check text-pink-300';
  toast.className = toast.className.replace(/bg-\S+/g, '') + (type === 'error' ? ' bg-red-700' : ' bg-gray-800');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/** Gabungkan daftar brand dari pengaturan + produk, tanpa duplikat */
export function mergeBrands(settingsBrands = [], products = []) {
  const seen = new Map();
  [...settingsBrands, ...products.map((p) => p.brand)].forEach((b) => {
    const name = String(b ?? '').trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
}
