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
- Semua adaptor database baru wajib menginduk (extend) pada abstract class `BaseAdaptor` di dalam file `src/core/adaptor.ts`.
- Setiap query wajib dibungkus dengan handling timeout maksimal 5000ms untuk mencegah CLI macet/stuck akibat jaringan internet yang buruk.

### 2. TUI Layer
- Ketika membuat baris komponen interaktif di CLI, pastikan komponen tersebut mematuhi batasan tinggi terminal aktif agar tidak terjadi overflow teks.

---

## 🔄 Sinkronisasi Project Management (n8n & Project Board Hook)
Setiap kali AI Agent berhasil menyelesaikan satu checkpoint tugas yang tertera di `ROADMAP.md` dan melakukan Git Commit, AI diwajibkan untuk mengirimkan sinyal HTTP Post ke Webhook n8n untuk memperbarui status papan kerja (Project Board):

```bash
curl -X POST [https://n8n.internal.workflow/v1/oops-sync](https://n8n.internal.workflow/v1/oops-sync) \
  -H "Content-Type: application/json" \
  -d '{"taskId": "1.1", "status": "COMPLETED", "agent": "AI-Agent-Core"}'