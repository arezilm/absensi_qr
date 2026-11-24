const Scanner = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] KONSTANTA & STATE
     ------------------------------------------------------------ */
  const COOLDOWN_MS = 2000;
  const RESULT_TIMEOUT_MS = 3000; // lama overlay tampil (ms)

  const TARGET_ID = 'reader';

  let html5QrCode = null;
  let isScanning = false;
  let lastScan = { text: null, time: 0 };
  let resultTimer = null;

  /* ------------------------------------------------------------
     [2] LIFECYCLE — start / stop kamera
     ------------------------------------------------------------ */
  async function start() {
    if (isScanning) {
      await stop();
      await delay(300);
    }

    if (typeof Html5Qrcode === 'undefined') {
      showSimple('Library scanner belum dimuat. Cek koneksi internet.', 'err');
      return;
    }

    if (!document.getElementById(TARGET_ID)) return;

    // Segarkan jam kerja dari server (kiosk yang terbuka lama tetap up-to-date)
    if (typeof JamKerja !== 'undefined') JamKerja.muat();

    html5QrCode = new Html5Qrcode(TARGET_ID);
    lastScan = { text: null, time: 0 };

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      isScanning = true;
    } catch (err) {
      console.error('Scanner: gagal start', err);
      showSimple('Gagal mengakses kamera. Pastikan izin kamera aktif.', 'err');
      html5QrCode = null;
      isScanning = false;
    }
  }

  async function stop() {
    clearResult();
    if (!html5QrCode) {
      isScanning = false;
      return;
    }
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch {
      /* ignore */
    } finally {
      html5QrCode = null;
      isScanning = false;
    }
  }

  /* ------------------------------------------------------------
     [3] HELPER — deteksi tanggal lokal (YYYY-MM-DD, tanpa UTC)
     ------------------------------------------------------------ */
  function todayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* Cek apakah ada reservasi manual untuk karyawan ini pada tanggal
     lokal hari ini. Dipakai agar scan tidak memberi kupon kedua
     saat kupon lembur sudah dicatat manual. */
  function hasManualToday(karyawanId) {
    if (!karyawanId) return false;
    const today = todayLocalISO();
    return Storage.getReservasiManual().some((r) => {
      if (r.karyawanId !== karyawanId) return false;
      return Utils.toLocalISODate(r.tanggal || r.createdAt) === today;
    });
  }

  /* ------------------------------------------------------------
     [4] HANDLE SCAN — inti logika absensi & kupon
     ------------------------------------------------------------ */
  function handleScan(text) {
    if (!isScanning) return;

    // Selama overlay validasi tampil, abaikan scan baru
    // (mencegah kartu yang sama terbaca dua kali berturut-turut)
    if (isOverlayOpen()) return;

    // Anti-duplikat: cooldown per teks QR
    const now = Date.now();
    if (lastScan.text === text && now - lastScan.time < COOLDOWN_MS) return;
    lastScan = { text, time: now };

    const karyawan = Karyawan.cari(text);
    if (!karyawan) {
      showSimple(`QR tidak dikenali: ${text}`, 'err');
      return;
    }

    // Karyawan non-aktif ditolak
    if (Utils.isKaryawanNonAktif(karyawan)) {
      showEmployee(
        karyawan,
        'err',
        'Karyawan Non-Aktif — absensi & kupon ditolak'
      );
      return;
    }

    // Bersihkan makan kemarin
    const archived = Storage.archiveStaleMeal(karyawan);
    if (archived) Storage.save();

    const nowIso = new Date().toISOString();
    const absenToday = Utils.isToday(karyawan.absenAt);
    const makanToday = Utils.isToday(karyawan.makanAt);
    const pulangToday = Utils.isToday(karyawan.pulangAt);
    const manualToday = hasManualToday(karyawan.id);
    const kuponToday = makanToday || manualToday;

    // --- STATE 1: belum absen hari ini → catat ABSENSI MASUK ---
    if (!absenToday) {
      karyawan.absen = true;
      karyawan.absenAt = nowIso;
      delete karyawan.pulangAt; // sisa hari sebelumnya
      Storage.addRiwayat(karyawan.nama, 'Absensi');
      Storage.catatPresensiMasuk(karyawan, nowIso);
      Storage.save();
      showEmployee(karyawan, 'ok', 'Absensi masuk berhasil dicatat');
    }
    // --- STATE 2: belum punya kupon hari ini → beri KUPON MAKAN ---
    else if (!kuponToday) {
      karyawan.makan = true;
      karyawan.makanAt = nowIso;
      karyawan.kuponKode = Utils.nextKodeTransaksi();
      karyawan.kuponReleased = true;
      karyawan.kuponReleasedAt = nowIso;
      Storage.addRiwayat(karyawan.nama, 'Kupon Makan');
      Storage.save();
      showEmployee(
        karyawan,
        'ok',
        pulangToday
          ? 'Kupon Makan lembur (tambahan) berhasil diambil'
          : 'Kupon Makan berhasil diambil'
      );
    }
    // --- STATE 3: sudah absen & punya kupon, belum pulang ---
    else if (!pulangToday) {
      if (!Utils.isSudahJamPulang()) {
        showEmployee(
          karyawan,
          'warn',
          makanToday
            ? `Sudah absen & sudah ambil kupon makan. Absen pulang mulai ${Utils.formatJamPulang()}`
            : 'Kupon makan hari ini sudah tercatat via reservasi manual'
        );
        return;
      }

      // Catat ABSENSI PULANG
      karyawan.pulangAt = nowIso;
      Storage.addRiwayat(karyawan.nama, 'Absensi Pulang');

      let msg = 'Absensi pulang berhasil dicatat';
      if (Utils.isLembur()) {
        const direset = Storage.autoResetLembur(karyawan);
        if (direset) {
          Storage.addRiwayat(karyawan.nama, 'Lembur - Kupon Direset');
          msg = 'Absensi pulang dicatat — LEMBUR: kupon makan direset, 1× kupon tambahan tersedia';
        } else {
          msg = 'Absensi pulang dicatat (lembur hari ini sudah pernah direset)';
        }
      }
      Storage.catatPresensiPulang(karyawan, nowIso, Utils.isLembur());
      Storage.save();
      showEmployee(karyawan, 'ok', msg);
    }
    // --- STATE 4: sudah absen pulang ---
    else {
      showEmployee(karyawan, 'warn', 'Sudah absen pulang & kupon makan hari ini sudah diambil');
    }

    // Sinkronkan tampilan
    Karyawan.render();
    if (typeof Dashboard !== 'undefined') Dashboard.render();

    if (
      typeof Reservasi !== 'undefined' &&
      document.getElementById('panel-reservasi')?.classList.contains('active')
    ) {
      Reservasi.render();
    }
    if (
      typeof ReservasiOvertime !== 'undefined' &&
      document.getElementById('panel-reservasi-overtime')?.classList.contains('active')
    ) {
      ReservasiOvertime.render();
    }
    if (
      typeof ReleaseReservasi !== 'undefined' &&
      document.getElementById('panel-release-reservasi')?.classList.contains('active')
    ) {
      ReleaseReservasi.render();
    }
  }

  /* ------------------------------------------------------------
     [5] TAMPILAN HASIL — OVERLAY LAYAR PENUH
         Markup  : <div id="scanOverlay"> di index.html
         Gaya    : .scan-overlay* di css/style.css
         Warna   : ok = hijau, warn = kuning, err = merah
         Tutup otomatis setelah RESULT_TIMEOUT_MS, atau ketuk layar.
     ------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  function ensureOverlayBound() {
    const ov = $('scanOverlay');
    if (!ov || ov.dataset.bound) return ov;
    ov.addEventListener('click', clearResult);
    ov.dataset.bound = '1';
    return ov;
  }

  function openOverlay(type, message, k) {
    const ov = ensureOverlayBound();
    if (!ov) return;
    if (resultTimer) clearTimeout(resultTimer);

    ov.className = `scan-overlay scan-overlay-${type}`;
    $('scanOverlayIcon').textContent = type === 'ok' ? '✓' : type === 'warn' ? '!' : '✕';
    $('scanOverlayMessage').textContent = message;

    const detail = $('scanOverlayDetail');
    if (k) {
      $('scanOverlayPhoto').innerHTML = k.foto
        ? `<img src="${escapeHtml(k.foto)}" alt="${escapeHtml(k.nama)}">`
        : `<span>${escapeHtml((k.nama || '?').charAt(0).toUpperCase())}</span>`;
      $('scanOverlayName').textContent = k.nama || '-';
      $('scanOverlayMeta').textContent = `${k.id} • ${k.kategori || '-'}`;
      $('scanOverlayTime').textContent = new Date().toLocaleTimeString('id-ID');
      detail.hidden = false;
    } else {
      detail.hidden = true;
    }

    // restart animasi bar hitung mundur
    const bar = $('scanOverlayBar');
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
    bar.style.animationDuration = `${RESULT_TIMEOUT_MS}ms`;

    ov.hidden = false;
    resultTimer = setTimeout(clearResult, RESULT_TIMEOUT_MS);
  }

  function isOverlayOpen() {
    const ov = $('scanOverlay');
    return !!ov && !ov.hidden;
  }

  function showSimple(msg, type) {
    openOverlay(type, msg, null);
  }

  function showEmployee(k, type, message) {
    openOverlay(type, message, k);
  }

  function clearResult() {
    if (resultTimer) {
      clearTimeout(resultTimer);
      resultTimer = null;
    }
    const ov = $('scanOverlay');
    if (ov) ov.hidden = true;

    // Beri jeda singkat agar QR yang sama tidak langsung terbaca ulang
    lastScan.time = Date.now();
  }

  /* ------------------------------------------------------------
     [6] HELPER
     ------------------------------------------------------------ */
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ------------------------------------------------------------
     [7] EXPORT API
     ------------------------------------------------------------ */
  return { start, stop, isActive: () => isScanning };
})();
