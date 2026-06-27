# 🤖 AGENTS: Aturan Kerja & Panduan AI Agentic Coding

Dokumen ini mendefinisikan batas-batas pengerjaan, standarisasi teknologi, dan pedoman otomatisasi bagi AI Agent (seperti Cline, Roo Code, atau Aider) yang bekerja di dalam repositori **Oops**.

---

## 🎯 Instruksi Utama Agent
1. **Dilarang Keras Mengubah Skema Existing Database:** Proyek ini adalah CMS untuk database yang sudah ada. AI dilarang memaksa struktur tabel baru atau memaksa migrasi tertentu ke database user. Semua data UI wajib berbasis pada hasil **introspeksi** skema database.
2. **Keterikatan Runtime:** Proyek ini menggunakan **Bun**. Jangan pernah menulis script otomasi atau backend yang menggunakan dependensi native Node.js tanpa memikirkan kecocokan dengan runtime Bun.
3. **Optimasi TUI:** Jangan gunakan library output terminal yang merusak history scroll. Pastikan penanganan layar (screen switching) dibersihkan secara total ketika CLI dimatikan agar terminal user kembali bersih.

---

## 📦 Aturan Pembuatan Komponen

### 1. Database Adaptor Layer
- Semua adaptor database baru wajib menginduk (extend) pada abstract class `BaseAdaptor` di dalam file `packages/core/src/adaptor.ts`.
- Setiap query wajib dibungkus dengan handling timeout maksimal 5000ms untuk mencegah CLI macet/stuck akibat jaringan internet yang buruk.

### 2. TUI Layer
- Ketika membuat baris komponen interaktif di CLI, pastikan komponen tersebut mematuhi batasan tinggi terminal aktif agar tidak terjadi overflow teks.
- **Renderer = pure ANSI.** Semua widget interaktif dibangun di atas `packages/cli/src/ui/{ansi,list,prompt,session}.ts`. **Dilarang** menambah dependensi full-screen renderer (Ink, blessed, neo-blessed, terminal-kit, React, dst.) — lihat `docs/adr/0001-tui-renderer.md` untuk alasannya.
- **Pemisahan state vs render.** Key reducer harus pure (state + key → state) supaya bisa di-unit-test tanpa TTY. Lihat `packages/cli/src/__tests__/tables.test.ts` & `browse.test.ts` untuk polanya.
- **Cleanup terminal.** Setiap TUI session (`runSession`) wajib merestore raw mode, hide→show cursor, dan melepas listener saat exit — baik pada exit normal, Ctrl-C, maupun exception.
