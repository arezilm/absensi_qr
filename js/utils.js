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
    isKaryawanNonAktif,
    nextKodeTransaksi,
    nextKodeOvertime,
  };
})();