const Utils = (() => {

  /* ------------------------------------------------------------
     [1] HTML ESCAPING — wajib untuk semua render dinamis
     ------------------------------------------------------------ */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------
     [2] FORMAT WAKTU
     ------------------------------------------------------------ */
  function formatWaktu(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
  }

  /* ------------------------------------------------------------
     [3] CEK TANGGAL — apakah value jatuh di HARI INI
     ------------------------------------------------------------ */
  function isToday(value) {
    if (!value) return false;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  /* ------------------------------------------------------------
     [3.b] NORMALISASI TANGGAL → 'YYYY-MM-DD' pada zona waktu LOKAL
         - 'YYYY-MM-DD' murni dikembalikan apa adanya
         - ISO UTC (…T20:00:00.000Z) dikonversi ke tanggal lokal
         JANGAN pakai String(x).slice(0, 10) pada ISO UTC: di WIB
         (UTC+7) hasilnya bisa tanggal kemarin dan membuat hitungan
         makan di Dashboard hilang.
     ------------------------------------------------------------ */
  function toLocalISODate(value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = value instanceof Date ? value : new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* ------------------------------------------------------------
     [3.c] JAM KERJA
         Nilai di bawah hanyalah DEFAULT (cadangan bila database belum
         punya pengaturan). Jam kerja yang berlaku diatur lewat menu
         Presensi → Pengaturan Jam Kerja, disimpan di database, lalu
         dimuat ke WORK lewat setWork().
         - MASUK   : jam masuk (info saja, tidak menolak absen lebih awal)
         - PULANG  : absen pulang baru bisa mulai jam ini
         - LEMBUR_SETELAH_MENIT : lembur jika pulang >= PULANG + menit ini
                     (boleh desimal, 0.5 = 30 detik) → kupon makan di-reset
     ------------------------------------------------------------ */
  const WORK_DEFAULT = Object.freeze({
    MASUK: '08:00',
    PULANG: '16:00',
    LEMBUR_SETELAH_MENIT: 120,
  });

  // Objek yang sama dipakai semua fungsi; diubah di tempat oleh setWork()
  const WORK = { ...WORK_DEFAULT };

  const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  function isJamValid(str) {
    return JAM_RE.test(String(str || '').trim());
  }

  // Terapkan pengaturan dari server: { masuk, pulang, lemburSetelahMenit }
  // Nilai yang tidak valid diabaikan (tetap memakai nilai sebelumnya).
  function setWork(cfg) {
    if (!cfg || typeof cfg !== 'object') return WORK;
    if (isJamValid(cfg.masuk)) WORK.MASUK = String(cfg.masuk).trim();
    if (isJamValid(cfg.pulang)) WORK.PULANG = String(cfg.pulang).trim();
    const m = Number(cfg.lemburSetelahMenit);
    if (cfg.lemburSetelahMenit !== null && cfg.lemburSetelahMenit !== '' &&
        Number.isFinite(m) && m >= 0) {
      WORK.LEMBUR_SETELAH_MENIT = m;
    }
    return WORK;
  }

  // 'HH:MM' / 'HH:MM:SS' → detik sejak 00:00
  function jamKeDetik(str) {
    const [h = 0, m = 0, s = 0] = String(str).split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }

  function detikHariIni(d) {
    const t = d instanceof Date ? d : new Date();
    return t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
  }

  function isSudahJamPulang(d) {
    return detikHariIni(d) >= jamKeDetik(WORK.PULANG);
  }

  function isLembur(d) {
    const batas = jamKeDetik(WORK.PULANG) + WORK.LEMBUR_SETELAH_MENIT * 60;
    return detikHariIni(d) >= batas;
  }

  function formatJamPulang() {
    return String(WORK.PULANG).slice(0, 8);
  }

  /* ------------------------------------------------------------
     [3.d] SORTING TABEL — klik header kolom (ID / Nama)
         cfg = { field, direction }; header: <th class="sortable" data-sort="id">
     ------------------------------------------------------------ */
  function sortBy(list, field, direction) {
    const angka = (v) => {
      const d = String(v || '').replace(/[^0-9]/g, '');
      return d === '' ? NaN : parseInt(d, 10);
    };
    const sorted = [...list].sort((a, b) => {
      if (field === 'id') {
        const na = angka(a.id);
        const nb = angka(b.id);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.id || '').localeCompare(String(b.id || ''), 'id', {
          sensitivity: 'base',
          numeric: true,
        });
      }
      const va = String(a[field] || '').toLowerCase().trim();
      const vb = String(b[field] || '').toLowerCase().trim();
      return va.localeCompare(vb, 'id', { sensitivity: 'base', numeric: true });
    });
    return direction === 'asc' ? sorted : sorted.reverse();
  }

  function updateSortIndicator(tableSel, cfg) {
    document.querySelectorAll(`${tableSel} th[data-sort]`).forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (cfg.field === th.dataset.sort) {
        th.classList.add(cfg.direction === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  function bindSortHeader(tableSel, cfg, onChange) {
    const thead = document.querySelector(`${tableSel} thead`);
    if (!thead) return;
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const field = th.dataset.sort;
      if (cfg.field === field) {
        cfg.direction = cfg.direction === 'asc' ? 'desc' : 'asc';
      } else {
        cfg.field = field;
        cfg.direction = 'asc';
      }
      onChange();
    });
  }

  /* ------------------------------------------------------------
     [4] CEK STATUS KARYAWAN — non-aktif = tolak operasi
     ------------------------------------------------------------ */
  function isKaryawanNonAktif(karyawan) {
    if (!karyawan) return false;
    const s = String(karyawan.status || '').toLowerCase().trim();
    return s === 'non-aktif' || s === 'nonaktif';
  }

  /* ------------------------------------------------------------
     [5] GENERATE KODE TRANSAKSI — TR-YYMM-XXX (auto-increment)
         Referensi: reservasi manual, kupon karyawan, arsip reservasi
     ------------------------------------------------------------ */
  function nextKodeTransaksi() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `TR-${yy}${mm}-`;

    let maxSeq = 0;

    if (typeof Storage !== 'undefined' && Storage) {
      try {
        Storage.getReservasiManual().forEach((r) => {
          const kode = String(r.kode || '');
          if (!kode.startsWith(prefix)) return;
          const seq = parseInt(kode.slice(prefix.length), 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca reservasi manual', err);
      }

      try {
        Storage.getKaryawan().forEach((k) => {
          const kode = String(k.kuponKode || '');
          if (!kode.startsWith(prefix)) return;
          const seq = parseInt(kode.slice(prefix.length), 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca kuponKode karyawan', err);
      }

      try {
        if (typeof Storage.getReservasiArchive === 'function') {
          Storage.getReservasiArchive().forEach((r) => {
            const kode = String(r.kode || '');
            if (!kode.startsWith(prefix)) return;
            const seq = parseInt(kode.slice(prefix.length), 10);
            if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
          });
        }
      } catch (err) {
        console.warn('Utils: gagal membaca arsip reservasi', err);
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /* ------------------------------------------------------------
     [5.b] GENERATE KODE OVERTIME — OT-YYMM-XXX (auto-increment)
         Format: OT-<YY><MM>-<seq 3 digit>
         Contoh: OT-2610-001, OT-2610-002, ...
         Hanya menghitung ID yang berformat baru (suffix ≥ 3 digit)
         agar tidak bentrok dengan ID lama hasil makeId('OT').
     ------------------------------------------------------------ */
  function nextKodeOvertime() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `OT-${yy}${mm}-`;

    let maxSeq = 0;

    if (typeof Storage !== 'undefined' && Storage) {
      try {
        Storage.getOvertime().forEach((r) => {
          const kode = String(r.id || '');
          if (!kode.startsWith(prefix)) return;
          const suffix = kode.slice(prefix.length);
          // Hanya hitung format baru: 3 digit atau lebih, semua angka
          if (!/^\d{3,}$/.test(suffix)) return;
          const seq = parseInt(suffix, 10);
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        });
      } catch (err) {
        console.warn('Utils: gagal membaca data overtime', err);
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /* ------------------------------------------------------------
     [6] EXPORT — API publik
     ------------------------------------------------------------ */
  return {
    escapeHtml,
    formatWaktu,
    isToday,
    toLocalISODate,
    sortBy,
    updateSortIndicator,
    bindSortHeader,
    WORK,
    WORK_DEFAULT,
    setWork,
    isJamValid,
    isSudahJamPulang,
    isLembur,
    formatJamPulang,
    isKaryawanNonAktif,
    nextKodeTransaksi,
    nextKodeOvertime,
  };
})();
