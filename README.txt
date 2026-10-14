GATASIA — Struktur Folder Rapi

CARA MENJALANKAN:
1. Ekstrak ZIP.
2. Masuk ke folder gatasia_merge_build.
3. Disarankan menggunakan backend: jalankan `node backend/server.js`.
4. Buka http://localhost:3000 di browser.
5. Untuk fitur profil, XP, misi, dan papan peringkat lintas sesi, jalankan melalui server ini, bukan hanya membuka index.html langsung.

STRUKTUR FOLDER:
- index.html                 Halaman utama / beranda
- pages/                     Halaman Jelajahi Peta, Misi Harian, Papan Peringkat, dan Profil
- assets/css/                Stylesheet utama, loading screen, dan dark mode
- assets/js/                 Logika halaman, sinkronisasi API, loading screen, dan dark mode
- assets/data/               Data 38 provinsi, pertanyaan, jawaban, dan posisi pin
- backend/                   Server Node.js dan penyimpanan data backend
- docs/                      Dokumentasi dan petunjuk proyek

CATATAN:
Pengorganisasian ini memindahkan file berdasarkan perannya dan memperbarui referensi jalur file. Logika fitur dan isi data aplikasi tidak sengaja diubah.
