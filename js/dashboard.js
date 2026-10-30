const Dashboard = (() => {
  const { escapeHtml } = Utils;

  /* ------------------------------------------------------------
     [1] RENDER UTAMA — panggil semua sub-render
     ------------------------------------------------------------ */
  function render() {
    // Auto-release overtime yang tanggalnya sudah lewat
    if (typeof Storage.autoReleaseStaleOvertime === 'function') {
      Storage.autoReleaseStaleOvertime();
    }

    // Safety net: arsipkan makan kemarin untuk semua karyawan
    if (typeof Storage.cleanupStaleMeals === 'function') {
      Storage.cleanupStaleMeals();
    }

    const list = Storage.getKaryawan();
    const total = list.length;
    const hadir = list.filter((k) => Utils.isToday(k.absenAt)).length;
    const makan = list.filter((k) => Utils.isToday(k.makanAt)).length;
    const belum = total - hadir;

    setText('statTotal', total);
    setText('statHadir', hadir);
    setText('statMakan', makan);
    setText('statBelum', belum);

    setText('detailBelum', belum);
    setText('detailHadir', hadir);
    setText('detailMakan', makan);
    setText('detailTotal', total);
    setText('detailLow', belum);

    setText('sumTotal', total);
    setText('sumHadir', hadir);
    setText('sumMakan', makan);
    setText('sumBelum', belum);

    renderDonut(hadir, total);
    renderRiwayat();
  }

  /* ------------------------------------------------------------
     [2] HELPER — set text & render donut
     ------------------------------------------------------------ */
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderDonut(hadir, total) {
    const percent = total > 0 ? Math.round((hadir / total) * 100) : 0;
    const donut = document.getElementById('donutChart');
    if (donut) {
      donut.style.background = `conic-gradient(#10b981 0% ${percent}%, #e2e8f0 ${percent}% 100%)`;
    }
    setText('donutPercent', `${percent}%`);
  }

  /* ------------------------------------------------------------
     [3] RENDER RIWAYAT SCAN
     ------------------------------------------------------------ */
  function renderRiwayat() {
    const tbody = document.getElementById('riwayat');
    if (!tbody) return;

    const riwayat = Storage.getRiwayat();

    if (riwayat.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Belum ada riwayat</td></tr>';
      return;
    }

    tbody.innerHTML = riwayat
      .slice(0, 30)
      .map(
        (r) => `
        <tr>
          <td class="cell-waktu">${escapeHtml(r.waktu)}</td>
          <td>${escapeHtml(r.nama)}</td>
          <td>${escapeHtml(r.jenis)}</td>
        </tr>`
      )
      .join('');
  }

  /* ------------------------------------------------------------
     [4] EXPORT API
     ------------------------------------------------------------ */
  return { render };
})();