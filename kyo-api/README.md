# 🚀 KYO API Server (Vercel)

Server backend mandiri untuk **KYO Downloader** yang mengatasi masalah *"Server is busy / limit"* pada public scraper.
Dibuat khusus untuk dideploy secara instan & gratis ke **[Vercel](https://vercel.com)**.

---

## ⚡ Fitur Server
- **TikTok Scraper**: HD No-watermark, SD, Audio MP3, dan Slide Foto (TikWM Engine - sangat cepat & tanpa limit ketat).
- **YouTube Scraper**: Support MP4 1080p, 720p, 480p, 360p, dan Audio MP3/M4A (@distube/ytdl-core).
- **CORS Enabled**: Bisa diakses langsung dari aplikasi desktop Electron maupun browser.
- **Serverless Ready**: Ringan dan langsung siap jalan di Vercel Functions.

---

## 🛠️ Cara Deploy ke Vercel (Gratis & Mudah)

### Cara 1: Lewat Website Vercel (Paling Mudah)
1. Buat repository baru di **GitHub** (misal namanya: `kyo-api`).
2. Masukkan semua isi folder `kyo-api` ini ke dalam repository tersebut (bukan folder induknya, tapi isi di dalam `kyo-api/`).
3. Buka [vercel.com](https://vercel.com) dan login dengan GitHub Anda.
4. Klik **"Add New..."** ➜ **"Project"** ➜ Import repository `kyo-api`.
5. Klik **"Deploy"** (tanpa ubah build setting apapun).
6. Setelah selesai, Anda akan mendapatkan URL Vercel (contoh: `https://kyo-api-xxx.vercel.app`).

### Cara 2: Lewat Command Line (Vercel CLI)
Buka terminal di dalam folder `kyo-api`:
```bash
npm install -g vercel
vercel
```
Ikuti instruksi di layar, pilih default untuk semua opsi. Setelah deploy sukses, gunakan flag `--prod`:
```bash
vercel --prod
```

---

## 🔗 Menggunakan Server di KYO Downloader
Setelah Anda mendapatkan URL Vercel (contoh: `https://kyo-api-yourname.vercel.app`):
1. Buka aplikasi **KYO Downloader**.
2. Masuk ke menu **Settings / Pengaturan** ➜ **Server Options**.
3. Masukkan URL server Vercel Anda di kolom **Custom Server**.
4. Selesai! Scraping akan langsung dialihkan ke server pribadi Anda tanpa terganggu antrean busy.
