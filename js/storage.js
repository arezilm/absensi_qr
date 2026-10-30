const Storage = (() => {
  const API_URL   = 'api.php';
  const MAX_RIWAYAT = 100;

  // ------------------------------------------------------------
  // CACHE IN-MEMORY
  // ------------------------------------------------------------
  let karyawan         = [];
  let riwayat          = [];
  let jenisKartu       = [];
  let reservasi        = [];
  let reservasiManual  = [];
  let reservasiArchive = [];
  let overtime         = [];

  // ------------------------------------------------------------
  // STATE SINKRONISASI
  // ------------------------------------------------------------
  let initialized   = false;
  let initPromise   = null;
  let syncing       = false;
  let pendingSync   = false;
  let lastSynced    = {};

  // ------------------------------------------------------------
  // INIT - fetch data awal dari MySQL (retry-able)
  // ------------------------------------------------------------
  function init() {
    if (initialized) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const res = await fetch(API_URL + '?action=bootstrap', { cache: 'no-store' });
        if (!res.ok) throw new Error('Bootstrap HTTP ' + res.status);
        const data = await res.json();
        if (!data || !data.ok) {
          throw new Error(data && data.error ? data.error : 'Bootstrap gagal');
        }

        karyawan         = Array.isArray(data.karyawan)         ? data.karyawan         : [];
        riwayat          = Array.isArray(data.riwayat)          ? data.riwayat          : [];
        jenisKartu       = Array.isArray(data.jenisKartu)       ? data.jenisKartu       : [];
        reservasiManual  = Array.isArray(data.reservasiManual)  ? data.reservasiManual  : [];
        reservasiArchive = Array.isArray(data.reservasiArchive) ? data.reservasiArchive : [];
        overtime         = Array.isArray(data.overtime)         ? data.overtime         : [];

        lastSynced  = snapshot();
        initialized = true;
      } finally {
        // Selalu bersihkan initPromise agar percobaan berikutnya
        // (setelah jaringan pulih) bisa benar-benar fetch ulang.
        initPromise = null;
      }
    })();

    return initPromise;
  }

  // ------------------------------------------------------------
  // INVALIDATE - reset cache tanpa sync (dipakai saat logout)
  // ------------------------------------------------------------
  function invalidate() {
    initialized   = false;
    initPromise   = null;
    syncing       = false;
    pendingSync   = false;
    karyawan         = [];
    riwayat          = [];
    jenisKartu       = [];
    reservasi        = [];
    reservasiManual  = [];
    reservasiArchive = [];
    overtime         = [];
    lastSynced = {};
  }

  // ------------------------------------------------------------
  // SNAPSHOT DAN DELTA
  // ------------------------------------------------------------
  function snapshot() {
    return {
      karyawan:         JSON.stringify(karyawan),
      riwayat:          JSON.stringify(riwayat),
      jenisKartu:       JSON.stringify(jenisKartu),
      reservasiManual:  JSON.stringify(reservasiManual),
      reservasiArchive: JSON.stringify(reservasiArchive),
      overtime:         JSON.stringify(overtime),
    };
  }

  function buildDelta() {
    const cur = snapshot();
    const delta = {};
    for (const key of Object.keys(cur)) {
      if (cur[key] !== lastSynced[key]) {
        delta[key] = JSON.parse(cur[key]);
      }
    }
    return delta;
  }

  // ------------------------------------------------------------
  // SAVE - kirim delta ke server
  // ------------------------------------------------------------
  function save() {
    if (!initialized) {
      console.warn('Storage.save() dipanggil sebelum init - diabaikan.');
      return;
    }
    queueSync();
  }

  async function queueSync() {
    if (syncing) { pendingSync = true; return; }

    const delta = buildDelta();
    if (Object.keys(delta).length === 0) return;

    const sentKeys = Object.keys(delta);

    syncing = true;
    try {
      const res = await fetch(API_URL + '?action=sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data && data.error ? data.error : 'HTTP ' + res.status);
      }

      for (const key of sentKeys) {
        lastSynced[key] = JSON.stringify(delta[key]);
      }
    } catch (err) {
      console.error('Storage: sync gagal', err);
      alert('Gagal menyimpan data ke server.\n\nPastikan XAMPP (Apache + MySQL) berjalan dan database sudah dibuat.');
    } finally {
      syncing = false;
      if (pendingSync) { pendingSync = false; queueSync(); }
    }
  }

  // ------------------------------------------------------------
  // KARYAWAN
  // ------------------------------------------------------------
  function getKaryawan()         { return karyawan; }
  function setKaryawan(data)     { karyawan = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // RIWAYAT
  // ------------------------------------------------------------
  function getRiwayat() { return riwayat; }
  function addRiwayat(nama, jenis) {
    riwayat.unshift({
      waktu: new Date().toLocaleString('id-ID'),
      nama: nama,
      jenis: jenis,
    });
    if (riwayat.length > MAX_RIWAYAT) riwayat.length = MAX_RIWAYAT;
  }

  // ------------------------------------------------------------
  // JENIS KARTU
  // ------------------------------------------------------------
  function getJenisKartu()     { return jenisKartu; }
  function setJenisKartu(data) { jenisKartu = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // RESERVASI
  // ------------------------------------------------------------
  function getReservasi()        { return reservasi; }
  function setReservasi(data)    { reservasi = Array.isArray(data) ? data : []; }

  function getReservasiManual()     { return reservasiManual; }
  function setReservasiManual(data) { reservasiManual = Array.isArray(data) ? data : []; }

  function getReservasiArchive()     { return reservasiArchive; }
  function setReservasiArchive(data) { reservasiArchive = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // OVERTIME
  // ------------------------------------------------------------
  function getOvertime()     { return overtime; }
  function setOvertime(data) { overtime = Array.isArray(data) ? data : []; }

  // ------------------------------------------------------------
  // SIKLUS HARIAN - arsip makan kemarin
  // ------------------------------------------------------------
  function isToday(value) {
    return Utils.isToday(value);
  }

  function archiveStaleMeal(k) {
    if (!k || !k.makan || !k.makanAt) return false;
    if (Utils.isToday(k.makanAt)) return false;

    reservasiArchive.push({
      id: 'RV-ARCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      kode: k.kuponKode || '',
      karyawanId: k.id,
      nama: k.nama,
      bagian: k.bagian || '',
      tanggal: k.makanAt,
      lembur: 'Tidak',
      tindakan: 'Ambil',
      keterangan: 'Siklus harian',
      released: k.kuponReleased !== false,
      releasedAt: k.kuponReleasedAt || k.makanAt,
      archivedAt: new Date().toISOString(),
    });

    k.makan = false;
    delete k.makanAt;
    delete k.kuponKode;
    delete k.kuponReleased;
    delete k.kuponReleasedAt;
    return true;
  }

  function cleanupStaleMeals() {
    let changed = false;
    karyawan.forEach((k) => { if (archiveStaleMeal(k)) changed = true; });
    if (changed) save();
    return changed;
  }

  // ------------------------------------------------------------
  // SIKLUS OVERTIME - auto-release
  // ------------------------------------------------------------
  function todayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function autoReleaseStaleOvertime() {
    const today = todayLocalISO();
    let changed = false;

    overtime.forEach((r) => {
      if (!r || r.status !== 'aktif') return;
      const tgl = String(r.tanggal || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return;
      if (tgl < today) {
        r.status = 'release';
        r.releasedAt = r.releasedAt || new Date().toISOString();
        r.autoReleased = true;
        changed = true;
      }
    });

    if (changed) save();
    return changed;
  }

  // ------------------------------------------------------------
  // RESET
  // ------------------------------------------------------------
  function reset() {
    karyawan = [];
    riwayat = [];
    reservasi = [];
    reservasiManual = [];
    reservasiArchive = [];
    overtime = [];
    save();
  }

  // ------------------------------------------------------------
  // EXPORT API
  // ------------------------------------------------------------
  return {
    init: init,
    invalidate: invalidate,
    getKaryawan: getKaryawan, setKaryawan: setKaryawan,
    getRiwayat: getRiwayat, addRiwayat: addRiwayat,
    getJenisKartu: getJenisKartu, setJenisKartu: setJenisKartu,
    getReservasi: getReservasi, setReservasi: setReservasi,
    getReservasiManual: getReservasiManual, setReservasiManual: setReservasiManual,
    getReservasiArchive: getReservasiArchive, setReservasiArchive: setReservasiArchive,
    getOvertime: getOvertime, setOvertime: setOvertime,
    save: save,
    reset: reset,
    isToday: isToday,
    archiveStaleMeal: archiveStaleMeal,
    cleanupStaleMeals: cleanupStaleMeals,
    todayLocalISO: todayLocalISO,
    autoReleaseStaleOvertime: autoReleaseStaleOvertime
  };
})();