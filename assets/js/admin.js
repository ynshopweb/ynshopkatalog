// Logika halaman admin (/admin): login Firebase + kelola produk, stok, dan nomor WA
import {
  db, auth, isFirebaseConfigured,
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
  arrayUnion, writeBatch,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  PRODUCTS_COL, SETTINGS_COL, SETTINGS_DOC,
} from './firebase.js';
import {
  DEFAULT_WA, IMG_FALLBACK, escapeHtml, safeUrl, formatRupiah, cleanPhone,
  priceInfo, attachImgFallback, openModal, closeModal, enableModalDismiss, showToast, mergeBrands,
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
      },
      (err) => showToast(friendlyError(err), 'error')
    ),
    onSnapshot(doc(db, SETTINGS_COL, SETTINGS_DOC), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      state.whatsapp = data.whatsappNumber || DEFAULT_WA;
      state.settingsBrands = Array.isArray(data.brands) ? data.brands : [];
    })
  );
}

function stopListening() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}

// ---------- Tabel produk ----------
function renderTable() {
  const tbody = $('adminProductTable');
  $('seedBox').classList.toggle('hidden', state.products.length > 0);

  tbody.innerHTML = state.products.map((p) => {
    const pr = priceInfo(p);
    return `
    <tr class="hover:bg-pink-50/50 transition" data-id="${escapeHtml(p.id)}">
      <td class="p-3">
        <img src="${escapeHtml(safeUrl(p.mainImg) || IMG_FALLBACK)}" alt="" class="w-12 h-12 object-cover rounded-xl border border-pink-100">
      </td>
      <td class="p-3 font-semibold text-gray-800">${escapeHtml(p.title)}</td>
      <td class="p-3"><span class="bg-pink-100 text-brand-pink font-bold text-xs px-2 py-0.5 rounded-full">${escapeHtml(p.brand)}</span></td>
      <td class="p-3 whitespace-nowrap">
        ${pr.onSale ? `<span class="block text-[11px] text-gray-400 line-through">Rp ${formatRupiah(pr.original)}</span>` : ''}
        <span class="font-bold text-gray-700">Rp ${formatRupiah(pr.price)}</span>
        ${pr.onSale ? `<span class="ml-1 text-[10px] font-extrabold bg-brand-yellow text-brand-dark px-1.5 py-0.5 rounded-full">-${pr.discount}%</span>` : ''}
      </td>
      <td class="p-3">
        <input type="number" min="0" value="${Number(p.stock) || 0}" data-action="stock"
          class="w-16 p-1 text-center border border-pink-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-brand-pink outline-none">
      </td>
      <td class="p-3 text-center whitespace-nowrap space-x-2">
        <button data-action="edit" class="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
        <button data-action="delete" class="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  attachImgFallback(tbody, 'https://placehold.co/100x100/FFF0F5/E12A5E?text=YN');
}

async function updateStockInline(id, value) {
  const stock = Math.max(0, parseInt(value, 10) || 0);
  try {
    await updateDoc(doc(db, PRODUCTS_COL, id), { stock, updatedAt: serverTimestamp() });
    showToast('Stok berhasil diperbarui!');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

async function deleteProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!confirm(`Hapus produk "${p?.title ?? ''}"?`)) return;
  try {
    await deleteDoc(doc(db, PRODUCTS_COL, id));
    showToast('Produk berhasil dihapus!');
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Form produk ----------
function addVariantInput(name = '', img = '') {
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center variant-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nama Varian (mis: Shade 01)';
  nameInput.className = 'variant-name w-1/3 p-2 border rounded-xl text-xs';
  nameInput.value = name;

  const imgInput = document.createElement('input');
  imgInput.type = 'url';
  imgInput.placeholder = 'URL Gambar Varian';
  imgInput.className = 'variant-img w-2/3 p-2 border rounded-xl text-xs';
  imgInput.value = img;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'text-red-500 hover:text-red-700 px-2';
  del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  del.addEventListener('click', () => row.remove());

  row.append(nameInput, imgInput, del);
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
    $('inputStock').value = product.stock;
    $('inputMainImg').value = product.mainImg;
    $('inputDescription').value = product.description || '';
    if (product.variants?.length) product.variants.forEach((v) => addVariantInput(v.name, v.img));
    else addVariantInput();
  } else {
    $('formModalTitle').textContent = 'Tambah Produk Baru';
    $('editProductId').value = '';
    addVariantInput();
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
    if (!name && !rawImg) continue;
    const img = rawImg ? safeUrl(rawImg) : mainImg;
    if (!img) return showToast(`URL gambar varian "${name || 'tanpa nama'}" tidak valid.`, 'error');
    variants.push({ name: name || 'Varian', img });
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
    stock: Math.max(0, parseInt($('inputStock').value, 10) || 0),
    mainImg,
    variants: variants.length ? variants : [{ name: 'Utama', img: mainImg }],
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

// ---------- Data contoh ----------
async function seedData() {
  try {
    const batch = writeBatch(db);
    SEED_PRODUCTS.forEach((p) => {
      batch.set(doc(collection(db, PRODUCTS_COL)), {
        ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
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
    if (btn.dataset.action === 'edit') openProductForm(state.products.find((p) => p.id === id));
    if (btn.dataset.action === 'delete') deleteProduct(id);
  });
  tbody.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'stock') updateStockInline(e.target.closest('tr').dataset.id, e.target.value);
  });

  enableModalDismiss(['productFormModal', 'storeSettingsModal']);

  showView('loading');
  initAuth();
}

init();
