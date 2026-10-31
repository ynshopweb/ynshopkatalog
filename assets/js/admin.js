// Logika halaman admin (/admin): login Firebase + kelola produk, stok, dan nomor WA
import {
  db, auth, isFirebaseConfigured,
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
  arrayUnion, writeBatch, runTransaction,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  PRODUCTS_COL, SETTINGS_COL, SETTINGS_DOC, STATS_COL,
} from './firebase.js';
import {
  DEFAULT_WA, IMG_FALLBACK, escapeHtml, safeUrl, formatRupiah, cleanPhone,
  priceInfo, variantStock, totalStock, attachImgFallback, openModal, closeModal, enableModalDismiss, showToast, mergeBrands,
} from './utils.js';
import { SEED_BRANDS, SEED_PRODUCTS } from './seed-data.js';

const $ = (id) => document.getElementById(id);

const state = {
  products: [],
  settingsBrands: [],
  whatsapp: DEFAULT_WA,
};
let unsubscribers = [];

// ---------- Tampilan ----------
function showView(name) {
  $('viewLoading').classList.toggle('hidden', name !== 'loading');
  $('viewLogin').classList.toggle('hidden', name !== 'login');
  const dash = $('viewDashboard');
  dash.classList.toggle('hidden', name !== 'dashboard');
  dash.classList.toggle('flex', name === 'dashboard');
}

function friendlyError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'Akun ini tidak punya izin admin.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Email atau password salah.';
  if (code.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
  if (code.includes('network')) return 'Koneksi internet bermasalah.';
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

// ---------- Auth ----------
function initAuth() {
  if (!isFirebaseConfigured) {
    showView('login');
    showLoginError('Firebase belum dikonfigurasi. Isi config di assets/js/firebase.js.');
    $('btnLogin').disabled = true;
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      $('adminUserEmail').textContent = `Masuk sebagai ${user.email}`;
      showView('dashboard');
      startListening();
    } else {
      stopListening();
      showView('login');
    }
  });
}

function showLoginError(msg) {
  const el = $('loginError');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

async function handleLogin(e) {
  e.preventDefault();
  showLoginError('');
  const btn = $('btnLogin');
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';
  try {
    await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value);
    $('loginPassword').value = '';
  } catch (err) {
    console.error(err);
    showLoginError(friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

// ---------- Data realtime ----------
function startListening() {
  stopListening();

  unsubscribers.push(
    onSnapshot(
      collection(db, PRODUCTS_COL),
      (snap) => {
        state.products = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        renderTable();
        renderBrandList();
      },
      (err) => showToast(friendlyError(err), 'error')
    ),
    onSnapshot(doc(db, SETTINGS_COL, SETTINGS_DOC), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      state.whatsapp = data.whatsappNumber || DEFAULT_WA;
      state.settingsBrands = Array.isArray(data.brands) ? data.brands : [];
      renderBrandList();
    })
  );
}

function stopListening() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}

// ---------- Tabel produk ----------
function adminVariants(p) {
  return p.variants?.length ? p.variants : [{ name: 'Utama', img: p.mainImg }];
}

// Satu baris ringkas per produk + satu baris panel "Kelola Varian" yang tertutup secara default.
// Baris tidak dibangun ulang saat hanya stok yang berubah (fokus & posisi scroll tetap aman).
const rowCache = new Map();   // id -> { sig, main, panel }
const expandedIds = new Set(); // produk yang panel variannya sedang terbuka

function structureSig(p) {
  return JSON.stringify([
    p.title, p.brand, p.mainImg, Number(p.price) || 0, Number(p.originalPrice) || 0,
    adminVariants(p).map((v) => v.name),
  ]);
}

function buildRows(p) {
  const pr = priceInfo(p);
  const variants = adminVariants(p);
  const total = totalStock(p);
  const open = expandedIds.has(p.id);
  const id = escapeHtml(p.id);
  const title = escapeHtml(p.title);

  const items = variants.map((v, i) => {
    const qty = variantStock(v, p);
    return `
      <label class="vp-item${qty <= 0 ? ' is-out' : ''}">
        <span class="vp-name">${escapeHtml(v.name)}<span class="vp-habis">Habis</span></span>
        <input type="number" min="0" step="1" inputmode="numeric" value="${qty}"
          data-action="stock" data-idx="${i}" class="vp-input" aria-label="Stok ${escapeHtml(v.name)}">
      </label>`;
  }).join('');

  const tmp = document.createElement('tbody');
  tmp.innerHTML = `
    <tr class="prow${open ? ' is-open' : ''}" data-id="${id}">
      <td class="p-3 align-middle">
        <img src="${escapeHtml(safeUrl(p.mainImg) || IMG_FALLBACK)}" alt="" class="w-12 h-12 object-cover rounded-xl border border-pink-100">
      </td>
      <td class="p-3 align-middle font-semibold text-gray-800 min-w-[140px]">${title}</td>
      <td class="p-3 align-middle"><span class="bg-pink-100 text-brand-pink font-bold text-xs px-2 py-0.5 rounded-full whitespace-nowrap">${escapeHtml(p.brand)}</span></td>
      <td class="p-3 align-middle whitespace-nowrap">
        ${pr.onSale ? `<span class="block text-[11px] text-gray-400 line-through">Rp ${formatRupiah(pr.original)}</span>` : ''}
        <span class="font-bold text-gray-700">Rp ${formatRupiah(pr.price)}</span>
        ${pr.onSale ? `<span class="ml-1 text-[10px] font-extrabold bg-brand-yellow text-brand-dark px-1.5 py-0.5 rounded-full">-${pr.discount}%</span>` : ''}
      </td>
      <td class="p-3 align-middle">
        <div class="flex flex-col items-start gap-1.5 min-w-[150px]">
          <div class="leading-tight">
            <span data-role="total" class="block text-xs font-extrabold ${total <= 0 ? 'text-red-600' : 'text-gray-800'}">Total Stok: ${total}</span>
            <span class="block text-[11px] text-gray-500">${variants.length} Varian</span>
          </div>
          <button type="button" data-action="toggle" aria-expanded="${open}" aria-controls="vp-${id}"
            class="prow-toggle inline-flex items-center gap-1.5 bg-white text-brand-pink border border-pink-200 hover:bg-pink-100 text-[11px] font-bold px-3 py-1.5 rounded-full transition whitespace-nowrap">
            Kelola Varian (${variants.length}) <i class="fa-solid fa-chevron-down prow-chevron text-[10px]"></i>
          </button>
        </div>
      </td>
      <td class="p-3 align-middle text-center whitespace-nowrap space-x-2">
        <button type="button" data-action="edit" class="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
        <button type="button" data-action="delete" class="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
    <tr class="vp-row${open ? ' is-open' : ''}" data-id="${id}">
      <td colspan="6">
        <div class="vp-wrap${open ? ' is-open' : ''}" id="vp-${id}" role="region" aria-label="Kelola varian ${title}">
          <div class="vp-inner">
            <div class="vp-content">
              <div class="flex items-center justify-between gap-2 mb-2">
                <h4 class="font-heading text-sm font-bold text-brand-pink min-w-0 truncate">Kelola Varian &ndash; ${title}</h4>
                <button type="button" data-action="close" class="flex-none inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-brand-pink bg-white border border-pink-200 px-2.5 py-1 rounded-full">
                  <i class="fa-solid fa-chevron-up text-[10px]"></i> Tutup
                </button>
              </div>
              <div class="vp-grid">${items}</div>
              <div class="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-pink-200">
                <span class="text-xs font-bold text-gray-700">Total stok seluruh varian: <span data-role="panel-total" class="text-brand-pink">${total}</span></span>
                <button type="button" data-action="close" class="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-brand-pink hover:bg-brand-pinkHover px-3 py-1.5 rounded-full">
                  <i class="fa-solid fa-chevron-up text-[10px]"></i> Tutup Varian
                </button>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>`;

  const [main, panel] = tmp.children;
  attachImgFallback(main, 'https://placehold.co/100x100/FFF0F5/E12A5E?text=YN');
  return { sig: structureSig(p), main, panel };
}

// Perbarui angka saja (tanpa mengganti elemen). Input yang sedang diketik tidak ditimpa.
function patchRows(p, entry) {
  const variants = adminVariants(p);
  const total = totalStock(p);

  const totalEl = entry.main.querySelector('[data-role="total"]');
  totalEl.textContent = `Total Stok: ${total}`;
  totalEl.classList.toggle('text-red-600', total <= 0);
  totalEl.classList.toggle('text-gray-800', total > 0);
  entry.panel.querySelector('[data-role="panel-total"]').textContent = total;

  entry.panel.querySelectorAll('input[data-idx]').forEach((input) => {
    const qty = variantStock(variants[Number(input.dataset.idx)], p);
    if (document.activeElement !== input) input.value = qty;
    input.closest('.vp-item').classList.toggle('is-out', qty <= 0);
  });
}

function setExpanded(id, open) {
  if (open) expandedIds.add(id); else expandedIds.delete(id);
  const entry = rowCache.get(id);
  if (!entry) return;
  entry.main.classList.toggle('is-open', open);
  entry.panel.classList.toggle('is-open', open);
  entry.panel.querySelector('.vp-wrap').classList.toggle('is-open', open);
  entry.main.querySelector('[data-action="toggle"]').setAttribute('aria-expanded', String(open));
  if (!open) entry.main.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderTable() {
  const tbody = $('adminProductTable');
  $('seedBox').classList.toggle('hidden', state.products.length > 0);

  const liveIds = new Set(state.products.map((p) => p.id));
  for (const [id, entry] of rowCache) {
    if (!liveIds.has(id)) {
      entry.main.remove();
      entry.panel.remove();
      rowCache.delete(id);
      expandedIds.delete(id);
    }
  }

  const wanted = [];
  state.products.forEach((p) => {
    let entry = rowCache.get(p.id);
    if (entry && entry.sig === structureSig(p)) {
      patchRows(p, entry);
    } else {
      if (entry) { entry.main.remove(); entry.panel.remove(); }
      entry = buildRows(p);
      rowCache.set(p.id, entry);
    }
    wanted.push(entry.main, entry.panel);
  });

  // Susun urutan tanpa memindahkan elemen yang sudah benar (menjaga fokus input)
  let ref = tbody.firstElementChild;
  wanted.forEach((node) => {
    if (node === ref) ref = ref.nextElementSibling;
    else tbody.insertBefore(node, ref);
  });
  while (ref) { const next = ref.nextElementSibling; ref.remove(); ref = next; }
}

/**
 * Simpan stok satu varian. Memakai transaksi Firestore: data dibaca ulang dari server,
 * hanya varian yang dipilih yang diubah, lalu total stok dihitung ulang dari semua varian.
 */
async function saveVariantStock(id, idx, input) {
  const p = state.products.find((x) => x.id === id);
  const current = p && adminVariants(p)[idx];
  if (!current) return;

  let qty = parseInt(input.value, 10);
  if (!Number.isFinite(qty) || qty < 0) qty = 0;   // tidak boleh negatif / kosong
  input.value = qty;
  if (qty === variantStock(current, p)) return;     // tidak ada perubahan: tidak perlu menulis

  input.classList.add('is-saving');
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, PRODUCTS_COL, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw Object.assign(new Error('missing'), { code: 'app/missing' });

      const data = snap.data();
      const list = adminVariants(data);
      if (!list[idx] || list[idx].name !== current.name) {
        throw Object.assign(new Error('stale'), { code: 'app/stale' });
      }
      const variants = list.map((v, i) => ({
        name: v.name,
        img: v.img,
        stock: i === idx ? qty : variantStock(v, data),
      }));
      tx.update(ref, {
        variants,
        stock: variants.reduce((sum, v) => sum + v.stock, 0),
        updatedAt: serverTimestamp(),
      });
    });
    showToast(`Stok "${current.name}" diperbarui!`);
  } catch (err) {
    console.error(err);
    input.value = variantStock(current, p);
    showToast(
      err.code === 'app/stale' || err.code === 'app/missing'
        ? 'Data produk sudah berubah. Muat ulang halaman lalu coba lagi.'
        : friendlyError(err),
      'error'
    );
  } finally {
    input.classList.remove('is-saving');
  }
}

async function deleteProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!confirm(`Hapus produk "${p?.title ?? ''}"?`)) return;
  try {
    await deleteDoc(doc(db, PRODUCTS_COL, id));
    deleteDoc(doc(db, STATS_COL, id)).catch(() => {}); // statistik produk ikut dibersihkan
    showToast('Produk berhasil dihapus!');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Form produk ----------
function addVariantInput(name = '', img = '', stock = '') {
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center variant-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Varian (mis: Shade 01)';
  nameInput.className = 'variant-name w-1/4 min-w-0 p-2 border rounded-xl text-xs';
  nameInput.value = name;

  const imgInput = document.createElement('input');
  imgInput.type = 'url';
  imgInput.placeholder = 'URL Gambar Varian (kosong = gambar utama)';
  imgInput.className = 'variant-img flex-1 min-w-0 p-2 border rounded-xl text-xs';
  imgInput.value = img;

  const stockInput = document.createElement('input');
  stockInput.type = 'number';
  stockInput.min = '0';
  stockInput.placeholder = 'Stok';
  stockInput.title = 'Stok varian ini';
  stockInput.className = 'variant-stock w-16 p-2 border rounded-xl text-xs text-center';
  stockInput.value = stock;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'text-red-500 hover:text-red-700 px-2';
  del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  del.addEventListener('click', () => row.remove());

  row.append(nameInput, imgInput, stockInput, del);
  $('variantInputsContainer').appendChild(row);
}

function fillBrandSelect(selected = '') {
  const select = $('inputBrand');
  const brands = mergeBrands(state.settingsBrands, state.products);
  select.innerHTML = '';
  if (!brands.length) {
    select.innerHTML = '<option value="">(Belum ada brand, isi Brand Baru)</option>';
  }
  brands.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
  if (selected) select.value = selected;
}

function openProductForm(product = null) {
  $('productForm').reset();
  $('variantInputsContainer').innerHTML = '';
  fillBrandSelect(product?.brand);

  if (product) {
    $('formModalTitle').textContent = 'Edit Produk';
    $('editProductId').value = product.id;
    $('inputTitle').value = product.title;
    $('inputPrice').value = product.price;
    $('inputOriginalPrice').value = product.originalPrice || '';
    $('inputMainImg').value = product.mainImg;
    $('inputDescription').value = product.description || '';
    adminVariants(product).forEach((v) => addVariantInput(v.name, v.img, variantStock(v, product)));
  } else {
    $('formModalTitle').textContent = 'Tambah Produk Baru';
    $('editProductId').value = '';
    addVariantInput('Utama', '', '');
  }
  updateDiscountPreview();
  openModal('productFormModal');
}

function updateDiscountPreview() {
  const el = $('discountPreview');
  const pr = priceInfo({
    price: $('inputPrice').value,
    originalPrice: $('inputOriginalPrice').value,
  });
  if (pr.onSale) {
    el.textContent = `Diskon ${pr.discount}% (hemat Rp ${formatRupiah(pr.original - pr.price)})`;
    el.className = '-mt-2 text-[11px] font-semibold text-green-600';
  } else if (Number($('inputOriginalPrice').value) > 0) {
    el.textContent = 'Harga coret harus lebih besar dari harga jual.';
    el.className = '-mt-2 text-[11px] font-semibold text-red-600';
  } else {
    el.className = 'hidden';
  }
}

async function saveProduct(e) {
  e.preventDefault();

  const editId = $('editProductId').value;
  const newBrand = $('inputNewBrand').value.trim();
  const brand = newBrand || $('inputBrand').value;
  const mainImg = safeUrl($('inputMainImg').value);

  if (!brand) return showToast('Pilih brand atau isi Brand Baru.', 'error');
  if (!mainImg) return showToast('URL gambar utama tidak valid (harus http/https).', 'error');

  const variants = [];
  for (const row of document.querySelectorAll('.variant-row')) {
    const name = row.querySelector('.variant-name').value.trim();
    const rawImg = row.querySelector('.variant-img').value.trim();
    const rawStock = row.querySelector('.variant-stock').value.trim();
    if (!name && !rawImg && !rawStock) continue;
    const img = rawImg ? safeUrl(rawImg) : mainImg;
    if (!img) return showToast(`URL gambar varian "${name || 'tanpa nama'}" tidak valid.`, 'error');
    variants.push({
      name: name || 'Varian',
      img,
      stock: Math.max(0, parseInt(rawStock, 10) || 0),
    });
  }
  if (!variants.length) {
    return showToast('Isi minimal satu varian beserta stoknya (pakai nama "Utama" jika tanpa varian).', 'error');
  }

  const price = Math.max(0, parseInt($('inputPrice').value, 10) || 0);
  const originalPrice = Math.max(0, parseInt($('inputOriginalPrice').value, 10) || 0);
  if (originalPrice && originalPrice <= price) {
    return showToast('Harga coret harus lebih besar dari harga jual.', 'error');
  }

  const data = {
    title: $('inputTitle').value.trim(),
    brand,
    price,
    originalPrice, // 0 = tidak ada promo
    stock: variants.reduce((sum, v) => sum + v.stock, 0), // total semua varian
    mainImg,
    variants,
    description: $('inputDescription').value.trim(),
    updatedAt: serverTimestamp(),
  };

  const btn = $('btnSaveProduct');
  btn.disabled = true;
  try {
    if (editId) {
      await updateDoc(doc(db, PRODUCTS_COL, editId), data);
      showToast('Produk berhasil diperbarui!');
    } else {
      await addDoc(collection(db, PRODUCTS_COL), { ...data, createdAt: serverTimestamp() });
      showToast('Produk baru berhasil ditambahkan!');
    }
    // Simpan brand ke daftar brand toko
    await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), { brands: arrayUnion(brand) }, { merge: true });
    closeModal('productFormModal');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------- Pengaturan toko ----------
function openSettings() {
  $('settingWhatsappNumber').value = state.whatsapp;
  openModal('storeSettingsModal');
}

async function saveSettings(e) {
  e.preventDefault();
  const number = cleanPhone($('settingWhatsappNumber').value);
  if (number.length < 8) return showToast('Nomor WhatsApp tidak valid.', 'error');
  try {
    await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), { whatsappNumber: number }, { merge: true });
    closeModal('storeSettingsModal');
    showToast('Nomor WA toko berhasil disimpan!');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Kelola brand ----------
function parseBrandNames(text) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function renderBrandList() {
  const list = $('brandList');
  if (!list) return;

  const brands = mergeBrands(state.settingsBrands, state.products);
  const counts = new Map();
  state.products.forEach((p) => {
    const key = String(p.brand || '').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  $('brandTotal').textContent = `${brands.length} brand`;

  if (!brands.length) {
    list.innerHTML = '<li class="text-xs text-gray-400 py-2">Belum ada brand.</li>';
    return;
  }

  list.innerHTML = brands.map((b) => {
    const n = counts.get(b.toLowerCase()) || 0;
    return `
      <li class="flex items-center justify-between gap-2 bg-pink-50/50 border border-pink-100 rounded-xl px-3 py-2">
        <span class="text-xs font-semibold text-gray-800 truncate">${escapeHtml(b)}</span>
        <span class="flex items-center gap-2 flex-shrink-0">
          <span class="text-[11px] text-gray-400">${n} produk</span>
          ${n === 0
            ? `<button data-brand="${escapeHtml(b)}" class="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="Hapus brand"><i class="fa-solid fa-trash text-xs"></i></button>`
            : ''}
        </span>
      </li>`;
  }).join('');
}

async function addBrands() {
  const names = parseBrandNames($('brandBulkInput').value);
  if (!names.length) return showToast('Tulis minimal satu nama brand.', 'error');

  const existing = new Set(mergeBrands(state.settingsBrands, state.products).map((b) => b.toLowerCase()));
  const fresh = [];
  names.forEach((n) => {
    const key = n.toLowerCase();
    if (!existing.has(key)) {
      existing.add(key);
      fresh.push(n);
    }
  });
  const skipped = names.length - fresh.length;

  if (!fresh.length) return showToast('Semua brand tersebut sudah ada.', 'error');

  const btn = $('btnAddBrands');
  btn.disabled = true;
  try {
    await setDoc(
      doc(db, SETTINGS_COL, SETTINGS_DOC),
      { brands: [...state.settingsBrands, ...fresh] },
      { merge: true }
    );
    $('brandBulkInput').value = '';
    showToast(`${fresh.length} brand ditambahkan${skipped ? `, ${skipped} dilewati (sudah ada)` : ''}.`);
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteBrand(name) {
  if (!confirm(`Hapus brand "${name}"?`)) return;
  try {
    await setDoc(
      doc(db, SETTINGS_COL, SETTINGS_DOC),
      { brands: state.settingsBrands.filter((b) => String(b).toLowerCase() !== name.toLowerCase()) },
      { merge: true }
    );
    showToast('Brand berhasil dihapus.');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Data contoh ----------
async function seedData() {
  try {
    const batch = writeBatch(db);
    SEED_PRODUCTS.forEach((p) => {
      // Bagi stok contoh ke tiap varian (sisa ke varian pertama)
      const n = p.variants.length;
      const base = Math.floor(p.stock / n);
      const variants = p.variants.map((v, i) => ({
        ...v,
        stock: base + (i === 0 ? p.stock - base * n : 0),
      }));
      batch.set(doc(collection(db, PRODUCTS_COL)), {
        ...p, variants, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    });
    batch.set(
      doc(db, SETTINGS_COL, SETTINGS_DOC),
      { brands: arrayUnion(...SEED_BRANDS) },
      { merge: true }
    );
    await batch.commit();
    showToast('Data contoh berhasil ditambahkan!');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Init ----------
function init() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('btnLogout').addEventListener('click', () => signOut(auth));

  $('btnAddProduct').addEventListener('click', () => openProductForm());
  $('btnSettings').addEventListener('click', openSettings);
  $('btnBrands').addEventListener('click', () => { renderBrandList(); openModal('brandModal'); });
  $('btnCloseBrands').addEventListener('click', () => closeModal('brandModal'));
  $('btnAddBrands').addEventListener('click', addBrands);
  $('brandList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-brand]');
    if (btn) deleteBrand(btn.dataset.brand);
  });
  $('btnSeed').addEventListener('click', seedData);

  $('productForm').addEventListener('submit', saveProduct);
  $('btnAddVariant').addEventListener('click', () => addVariantInput());
  $('inputPrice').addEventListener('input', updateDiscountPreview);
  $('inputOriginalPrice').addEventListener('input', updateDiscountPreview);
  $('btnCloseForm').addEventListener('click', () => closeModal('productFormModal'));
  $('btnCancelForm').addEventListener('click', () => closeModal('productFormModal'));

  $('settingsForm').addEventListener('submit', saveSettings);
  $('btnCloseSettings').addEventListener('click', () => closeModal('storeSettingsModal'));

  // Delegasi event tabel produk
  const tbody = $('adminProductTable');
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    switch (btn.dataset.action) {
      case 'edit': openProductForm(state.products.find((p) => p.id === id)); break;
      case 'delete': deleteProduct(id); break;
      case 'toggle': setExpanded(id, !expandedIds.has(id)); break;
      case 'close': setExpanded(id, false); break;
    }
  });
  tbody.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-action="stock"]');
    if (input) saveVariantStock(input.closest('tr').dataset.id, Number(input.dataset.idx), input);
  });

  enableModalDismiss(['productFormModal', 'storeSettingsModal', 'brandModal']);

  showView('loading');
  initAuth();
}

init();
