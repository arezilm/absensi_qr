/* ============================================================
   JAM KERJA — pengaturan jam masuk, pulang & batas lembur
   ============================================================ */
const JamKerja = (() => {
  const API_URL = 'api.php';
  const $ = (id) => document.getElementById(id);

  const pad = (n) => String(n).padStart(2, '0');

  function detikKeJam(total) {
    const t = Math.floor(total);
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  }

  function jamKeDetik(str) {
    const [h = 0, m = 0, s = 0] = String(str).split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }

  function formInputs() {
    return [$('jkMasuk'), $('jkPulang'), $('jkLembur')];
  }

  function isiForm(cfg) {
    if ($('jkMasuk')) $('jkMasuk').value = cfg.MASUK;
    if ($('jkPulang')) $('jkPulang').value = cfg.PULANG;
    if ($('jkLembur')) $('jkLembur').value = cfg.LEMBUR_SETELAH_MENIT;
    updatePreview();
  }

  /* ---------- tampilan ---------- */
  function render() {
    if (!$('formJamKerja')) return;

    isiForm(Utils.WORK);

    // Pengguna tanpa izin "edit" hanya bisa melihat
    const boleh = typeof Akses === 'undefined' || Akses.can('jamKerja', 'edit');
    formInputs().forEach((el) => { if (el) el.disabled = !boleh; });
  }

  function updatePreview() {
    const box = $('jkPreview');
    if (!box) return;

    const masuk = $('jkMasuk')?.value;
    const pulang = $('jkPulang')?.value;
    const menit = Number($('jkLembur')?.value);

    if (!Utils.isJamValid(masuk) || !Utils.isJamValid(pulang) || !Number.isFinite(menit) || menit < 0) {
      box.textContent = 'Lengkapi semua isian untuk melihat ringkasan.';
      return;
    }

    const batas = jamKeDetik(pulang) + menit * 60;
    const lemburTxt = batas >= 86400
      ? '<span class="jam-warn">Batas lembur melewati tengah malam — lembur tidak akan pernah terdeteksi.</span>'
      : `Lembur dihitung jika absen pulang pada pukul <strong>${detikKeJam(batas)}</strong> atau lebih.`;

    box.innerHTML =
      `Jam kerja <strong>${escapeText(masuk)}</strong> – <strong>${escapeText(pulang)}</strong>.<br>` +
      `Absen pulang bisa dicatat mulai pukul <strong>${escapeText(pulang)}</strong>.<br>` +
      lemburTxt;
  }

  function escapeText(v) {
    return Utils.escapeHtml(v);
  }

  /* ---------- aksi ---------- */
  function isiDefault() {
    isiForm(Utils.WORK_DEFAULT);
  }

  async function simpan() {
    const masuk = ($('jkMasuk')?.value || '').trim();
    const pulang = ($('jkPulang')?.value || '').trim();
    const menitRaw = $('jkLembur')?.value;
    const menit = Number(menitRaw);

    if (!Utils.isJamValid(masuk)) { alert('Jam masuk tidak valid.'); $('jkMasuk')?.focus(); return; }
    if (!Utils.isJamValid(pulang)) { alert('Jam pulang tidak valid.'); $('jkPulang')?.focus(); return; }
    if (menitRaw === '' || !Number.isFinite(menit) || menit < 0 || menit > 1440) {
      alert('Batas lembur harus berupa angka 0 - 1440 menit.');
      $('jkLembur')?.focus();
      return;
    }
    if (jamKeDetik(pulang) <= jamKeDetik(masuk)) {
      alert('Jam pulang harus lebih besar dari jam masuk.');
      $('jkPulang')?.focus();
      return;
    }

    const btn = $('btnSimpanJamKerja');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}?action=save_jam_kerja`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masuk, pulang, lemburSetelahMenit: menit }),
      });
      let data = {};
      try { data = await res.json(); } catch { /* ignore */ }
      if (!res.ok || !data.ok) {
        throw new Error((data && data.error) || `Gagal menyimpan (HTTP ${res.status}).`);
      }

      Utils.setWork(data.jamKerja);
      render();
      alert('Pengaturan jam kerja berhasil disimpan.');
    } catch (err) {
      console.error('JamKerja: gagal simpan', err);
      alert(err.message || 'Gagal menyimpan pengaturan jam kerja.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Ambil pengaturan terbaru dari server (dipanggil saat scanner dimulai)
  async function muat() {
    try {
      const res = await fetch(`${API_URL}?action=get_jam_kerja`, { cache: 'no-store' });
      const data = await res.json();
      if (!data || !data.ok) return;
      Utils.setWork(data.jamKerja);
      if ($('panel-jam-kerja')?.classList.contains('active')) render();
    } catch (err) {
      console.warn('JamKerja: gagal memuat dari server, memakai nilai terakhir', err);
    }
  }

  return { render, simpan, isiDefault, updatePreview, muat };
})();
