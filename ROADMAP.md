# 🗺️ ROADMAP: Oops (Multi-Instance DB Management Hub)

Roadmap ini merangkum strategi pengembangan proyek **Oops** ke dalam dua jalur utama.
Jalur 1 berfokus pada kecepatan ekstrem Terminal User Interface (TUI) berbasis Bun dengan batasan lisensi lokal (monetisasi awal).
Jalur 2 memperluas fungsionalitas ke dashboard berbasis Cloud (Web Dashboard) layaknya PHPMyAdmin modern dengan fitur kolaborasi dan kapasitas instance tak terbatas.

---

## 🏎️ Track 1: Oops CLI (Core & TUI Engine)
*Fokus: Produktivitas developer langsung di terminal, startup instan dengan Bun, integrasi Cloudflare D1, dan batasan instance lokal.*

### Phase 1.1: Fondasi & Konektivitas Cloudflare D1 (Free Tier)
- [x] Inisialisasi lingkungan proyek menggunakan **Bun** dan **TypeScript**.
- [x] Konfigurasi CLI Command Parser menggunakan library interaktif (misalnya `@clack/prompts`).
- [x] Implementasi **Cloudflare D1 Adaptor** via Cloudflare REST API (menggunakan Global API Key atau Cloudflare Workers Token).
- [x] Menyediakan media penyimpanan kredensial lokal yang aman dan terisolasi di file `~/.config/oops/config.json`.
- [x] Membangun fitur introspeksi database otomatis untuk membaca tabel yang sudah ada (`SELECT name FROM sqlite_master WHERE type='table'`).

### Phase 1.2: Visualisasi TUI Interaktif & Render Data (Free Tier)
- [x] Integrasi engine visualisasi teks berbasis **pure ANSI escape sequences** di atas `readline` (lihat `docs/adr/0001-tui-renderer.md`; Ink/React ditolak).
- [x] Membuat component rendering tabel in-house (`src/ui/render.ts`) dengan auto-padding dan pembatasan lebar teks jika kolom terlalu panjang.
- [x] Implementasi navigasi tabel interaktif menggunakan tombol panah keyboard (`Up`, `Down`, `Left`, `Right`) dan tombol `Enter`.
- [x] Menambahkan fitur pencarian/filter teks langsung di terminal terhadap data tabel yang sedang aktif.

### Phase 1.3: Operasi CRUD Dinamis & Validasi (Free Tier)
- [x] Membuat generator form input dinamis di CLI yang membaca tipe data kolom (`TEXT`, `INTEGER`, `BOOLEAN`) untuk memunculkan jenis input prompt yang sesuai.
- [x] Implementasi fungsi untuk menambah data (`Create`) dan mengubah baris data (`Update`) secara aman.
- [x] Menambahkan sistem "Confirmation Prompt" sebelum menjalankan instruksi destruktif (seperti `DELETE ROW` atau `DROP TABLE`).

### Phase 1.4: Dukungan Multi-Database & Sistem Pembatasan Instance (Monetisasi CLI)
- [x] Refactor struktur kode agar arsitektur database bersifat *pluggable* (bisa dipasang adaptor baru dengan mudah).
- [x] Membuat adaptor untuk **Neon (Serverless Postgres)** menggunakan driver `@neondatabase/serverless` (WebSocket/connection pooling).
- [x] **Instance Guard:** Mengunci konfigurasi lokal maksimal hanya bisa menyimpan **5 instance database aktif** untuk pengguna gratis.
- [x] Menambahkan perintah `oops upgrade` yang mengarahkan user ke halaman web untuk memasukkan license key agar bisa mengelola instance tanpa batas.
- [x] Menambahkan perintah `oops license <key>` untuk menukarkan license key dan verifikasi tier online.

---

## ☁️ Track 2: Oops Cloud (Web Dashboard SaaS)
*Fokus: Akses terpusat, skalabilitas tinggi, manajemen tim/kolaborasi, dan monetisasi SaaS penuh.*

### Phase 2.1: Infrastruktur Multi-Tenant & Cloud Service
- [ ] Membangun backend berbasis Cloudflare Workers dan Hyperdrive untuk melakukan routing dan enkapsulasi query dengan performa tinggi.
- [ ] Implementasi sistem autentikasi user (OAuth GitHub / Magic Link) dan manajemen akun.
- [ ] Menyediakan media enkripsi kredensial database di sisi server (Vault) agar aman dari kebocoran data.

### Phase 2.2: PHPMyAdmin Modern (Web Interface)
- [ ] Membuat dashboard web Single Page Application (SPA) yang bersih, minimalis, super cepat, dan mengusung filosofi desain ala terminal.
- [ ] Menyediakan visual query builder, log monitoring *real-time*, dan analisis performa index database.
- [ ] Mendukung console SQL mentah (Raw SQL Query) lengkap dengan fitur autocomplete.

### Phase 2.3: Fitur Enterprise & Monetization Release
- [ ] Menambahkan fitur *Team Workspaces* agar tim developer bisa berkolaborasi mengelola database perusahaan tanpa perlu membagikan API key/connection string utama.
- [ ] Integrasi gateway pembayaran (Stripe / LemonSqueezy) untuk sistem langganan bulanan (Pro vs Enterprise).
- [ ] Menyediakan fitur automated backup, audit log aktivitas query, dan alert otomatis jika database production mengalami gangguan.
