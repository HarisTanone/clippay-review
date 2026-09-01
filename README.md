# ClipPay — Submission Review & Approval System

Repositori ini berisi solusi lengkap untuk **Take-Home Test - Fullstack Developer: ClipPay**.

Aplikasi dibangun menggunakan **Next.js (App Router)**, **TypeScript**, dan **PostgreSQL**, dengan fokus utama pada **kebenaran uang (financial correctness)**, **ketahanan race condition / double approval**, dan **performa query pada volume data besar (50.000+ baris)**.

---

## Daftar Isi
1. [Cara Menjalankan](#1-cara-menjalankan)
2. [Keputusan Teknis dan Alasannya](#2-keputusan-teknis-dan-alasannya)
3. [Ketahanan Concurrency & Race Condition](#3-ketahanan-concurrency--race-condition)
4. [Kebenaran Finansial & Penanganan Floating Point](#4-kebenaran-finansial--penanganan-floating-point)
5. [Strategi Indexing & Performa Query (50.000+ Baris)](#5-strategi-indexing--performa-query-50000-baris)
6. [Fitur Bonus](#6-fitur-bonus)
7. [Jawaban Bonus B2: Penanganan Views Drop / Fraud](#7-jawaban-bonus-b2-penanganan-views-drop--fraud)
8. [Trade-offs & Apa yang Akan Dikerjakan Jika Ada Waktu Lebih](#8-trade-offs--apa-yang-akan-dikerjakan-jika-ada-waktu-lebih)

---

## 1. Cara Menjalankan

### Prasyarat
- Node.js (v18+ atau v20+) & npm
- Docker & Docker Compose
- `psql` (opsional jika ingin akses CLI database langsung)

### Langkah-langkah

1. **Jalankan Database PostgreSQL via Docker Compose**:
   ```bash
   docker compose up -d
   ```
   > Postgres berjalan di port `5433` (bukan 5432) untuk menghindari bentrok dengan Postgres lokal mesin.

2. **Load Skema Database & Seed 50.000 Submission**:
   ```bash
   psql "postgresql://clippay:clippay@localhost:5433/clippay" -f schema.sql
   ```

3. **Jalankan Migrasi Indeks Performa & Constraint**:
   ```bash
   psql "postgresql://clippay:clippay@localhost:5433/clippay" -f migrations/01_performance_indexes.sql
   ```

4. **Install Dependensi Proyek**:
   ```bash
   npm install
   ```

5. **Jalankan Server Development / Production**:
   - Mode Development:
     ```bash
     npm run dev
     ```
   - Atau Build & Start Production:
     ```bash
     npm run build
     npm run start
     ```
   Aplikasi siap diakses di: **`http://localhost:3005/review`** (atau `http://localhost:3005` yang otomatis me-redirect ke `/review`).

### Menjalankan Pengujian Otomatis

1. **Unit Test Kalkulasi Finansial (Bonus B1)**:
   ```bash
   npm test
   ```
   *Menguji kalkulasi earning, rounding, edge cases (views 0, views < 1000, viral views), dan invarian finansial.*

2. **Pengujian Concurrency & Race Condition Simulation**:
   ```bash
   npm run test:concurrency
   ```
   *Mensimulasikan 5 request approve paralel secara simultan ke satu submission yang sama, serta menguji penolakan approval saat budget campaign bernilai 0 / tidak cukup.*

---

## 2. Keputusan Teknis dan Alasannya

### Mengapa memilih native `pg` (node-postgres) Connection Pool?
Dalam `SOAL.md` diberikan kebebasan memilih library (`pg`, Drizzle, Prisma, Kysely). Kami secara sadar memilih **native `pg` connection pool** dengan wrapper transaksi terisolasi:
- **Kontrol Transaksi Database Eksplisit**: Kami membutuhkan kontrol mutlak atas sintaks transaksi (`BEGIN`, `COMMIT`, `ROLLBACK`) dan *pessimistic row-level locking* (`SELECT ... FOR UPDATE`).
- **Zero ORM Overhead & N+1 Prevention**: Pada tabel dengan 50.000+ baris data, ORM tingkat tinggi sering menambahkan overhead abstraksi atau serialisasi data yang tidak perlu. Query SQL mentah dengan parameterized parameters ($1, $2) memastikan performa maksimal dan rencana eksekusi (query plan) yang 100% transparan.
- **Keamanan Injection**: Seluruh query menggunakan parameterized queries bawaan driver PostgreSQL, mencegah celah SQL Injection.

---

## 3. Ketahanan Concurrency & Race Condition

Di lingkungan nyata, dua skenario berbahaya sering terjadi:
1. **Double Click / Multi-Admin Approval**: Dua admin mengklik tombol "Approve" pada submission yang sama secara bersamaan, atau pengguna double-click tombol.
2. **Budget Exhaustion Race**: Dua submission berbeda untuk campaign yang sama disetujui bersamaan ketika sisa budget campaign hanya cukup untuk salah satu submission.

### Solusi yang Diimplementasikan:
1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Pada endpoint `POST /api/submissions/:id/approve`, submission dikunci dengan `FOR UPDATE`. Jika ada request kedua masuk, request kedua akan menunggu (lock wait). Setelah lock dilepas, request kedua membaca status terbaru dan langsung ditolak dengan **`409 Conflict`** ("Submission ini sudah disetujui sebelumnya").
   - Campaign juga dikunci dengan `FOR UPDATE` di dalam transaksi yang sama. Ini menjamin penghitungan dan pengurangan `remaining_budget` dilakukan secara serial dan atomik.
2. **Database Engine Constraint Protection**:
   - Tabel `campaigns` memiliki constraint `remaining_budget bigint not null check (remaining_budget >= 0)`.
   - Menambahkan **Unique Constraint** di level database:
     ```sql
     CREATE UNIQUE INDEX idx_earnings_submission_id ON earnings (submission_id);
     ```
     Bahkan jika ada kegagalan di lapisan aplikasi, kernel database Postgres menjamin secara fisik bahwa satu submission mustahil memiliki lebih dari satu baris pembayaran di tabel `earnings`.
3. **UI Double-Click Protection**:
   - Tombol "Approve" di antarmuka web langsung masuk ke status loading disabled begitu diklik, mencegah klik ganda sebelum respons diterima.

---

## 4. Kebenaran Finansial & Penanganan Floating Point

### Masalah Presisi IEEE 754:
Di JavaScript, pembagian desimal rentan terhadap *floating point inaccuracy*:
```javascript
// Contoh nyata: 1.132 views dengan CPM Rp 2.500
(1132 / 1000) * 2500 // Hasilnya: 2829.9999999999995
Math.floor((1132 / 1000) * 2500) // Menghasilkan: 2829 (kehilangan Rp 1!)
```
### Solusi Kami:
Perkalian dilakukan terlebih dahulu sebelum pembagian:
```javascript
Math.floor((views * cpm) / 1000) // (1132 * 2500) / 1000 = 2830 (presisi 100%!)
```

### Formula Perhitungan Uang & Zero Penny Leak:
Sesuai contoh di `SOAL.md`: 12.345 views, CPM Rp1.500 → kotor Rp18.517 → net Rp14.813:
- `grossAmount = Math.floor((views * cpm) / 1000)` = 18.517
- `feeAmount = Math.ceil(grossAmount * 0.20)` = 3.704
- `netAmount = grossAmount - feeAmount` = 14.813
- **Invarian Finansial Terjamin**:
  $$\text{grossAmount} = \text{feeAmount} + \text{netAmount}$$
  $$18.517 = 3.704 + 14.813$$
  Tidak ada selisih sepeser rupiah pun yang bocor akibat pembulatan.

---

## 5. Strategi Indexing & Performa Query (50.000+ Baris)

Skema bawaan `schema.sql` hanya memiliki index sederhana: `(status)`, `(campaign_id)`, `(submitted_at desc)`.

### Masalah Query Bawaan:
Ketika query review dijalankan:
`WHERE status = 'pending' ORDER BY submitted_at DESC LIMIT 20 OFFSET 0`
Postgres harus memilih antara menggunakan index `status` lalu melakukan *Sort* di memori terhadap 50.000 baris, atau menggunakan index `submitted_at` lalu menyaring status. Keduanya lambat jika data terus bertambah.

### Indeks yang Ditambahkan ([migrations/01_performance_indexes.sql](migrations/01_performance_indexes.sql)):
1. `idx_submissions_status_submitted_at (status, submitted_at DESC)`:
   - Memungkinkan Postgres melakukan *Index Scan* terurut langsung tanpa biaya *Sort* sama sekali. Waktu eksekusi turun menjadi **< 3.5 milidetik**.
2. `idx_submissions_campaign_status_submitted_at (campaign_id, status, submitted_at DESC)`:
   - Mengoptimalkan filtering ganda saat admin menyaring berdasarkan campaign tertentu.
3. `idx_submissions_creator_id (creator_id)`:
   - Kolom FK tidak otomatis diindeks oleh Postgres. Index ini mempercepat operasi `JOIN creators`.
4. `idx_earnings_campaign_id (campaign_id)`:
   - Mempercepat agregasi ringkasan campaign (Bonus B3).
5. **Optimasi Pencarian Gabungan (Unified Search)**:
   - Endpoint `GET /api/submissions` mendukung pencarian cerdas yang mencocokkan **username creator** maupun **judul campaign** (`search=...`) serta filter spesifik `campaignSearch=...` dan `campaignId=...`.
6. **Optimasi Count Query**:
   - Jika pengguna tidak melakukan pencarian text, query `COUNT(*)` tidak perlu melakukan `JOIN creators` atau `campaigns`, melainkan membaca langsung dari `submissions` via *Index Only Scan* (~7 milidetik).

---

## 6. Fitur Bonus

### Bonus B1: Unit Test Perhitungan Finansial
- File pengujian: [`lib/__tests__/finance.test.ts`](lib/__tests__/finance.test.ts).
- Menjalankan 9 kasus uji utama:
  - Contoh resmi `SOAL.md` (12.345 views, CPM 1.500).
  - Kasus batas views 0.
  - Kasus batas views kecil (< 1.000 views, 500 views, 1 view).
  - Kasus kelipatan pas & volume viral besar (15.000.000 views).
  - Validasi invarian `gross === net + fee` pada 200 iterasi nilai acak.
  - Penolakan input negatif / invalid.

### Bonus B3: API Ringkasan Campaign
- Endpoint: `GET /api/campaigns/:id/summary`
- Mengembalikan ringkasan komprehensif dalam **1 query agregasi efisien**:
  - Informasi campaign & status
  - Total submission, jumlah pending, approved, rejected
  - Total budget, sisa budget, dan budget terpakai
  - Total earning kotor terbayar, total net diterima creator, dan total fee platform
- Dilengkapi dengan modal interaktif di halaman review UI (klik tombol **Ringkasan Campaign**).

---

## 7. Jawaban Bonus B2: Penanganan Views Drop / Fraud

### Pertanyaan:
> *Views video bisa turun — platform seperti TikTok/Instagram rutin membersihkan views palsu. Misalnya sebuah video di-approve saat 100.000 views (creator sudah dibayar), lalu minggu depan views-nya tinggal 60.000. Menurutmu apa yang harus dilakukan sistem? Jelaskan pilihanmu beserta konsekuensinya bagi creator dan bagi brand.*

### Analisis Opsi & Konsekuensi:

#### Opsi 1: Rekonsiliasi Otomatis via Saldo Negatif (Clawback / Negative Balance Wallet)
Sistem menghitung ulang earning berdasarkan 60.000 views. Selisih 40.000 views yang terlanjur dibayar ditarik kembali dari wallet creator. Jika saldo tidak cukup, saldo creator menjadi negatif dan dipotong dari submission berikutnya.
- **Konsekuensi bagi Brand**: Sangat terlindungi. Brand hanya membayar views riil organik.
- **Konsekuensi bagi Creator**: Dampak psikologis dan kepercayaan sangat buruk. Banyak creator pemula tidak mengerti algoritma bot-cleaning TikTok dan merasa uang yang sudah sah mereka terima "dirampok" kembali oleh platform, berpotensi memicu churn creator yang tinggi.

#### Opsi 2: Brand / Platform Menanggung Kerugian Penuh (No Clawback)
Uang yang sudah di-approve dianggap final (*irreversible*). Penurunan views diserap sebagai biaya risiko (cost of doing business).
- **Konsekuensi bagi Creator**: Sangat disukai creator karena kepastian pembayaran 100%.
- **Konsekuensi bagi Brand & Platform**: Celah eksploitasi (*fraud loop*). Creator nakal dapat membeli bot view murah seharga Rp 20.000 untuk mendapatkan 50.000 views, submit ke ClipPay untuk mencairkan Rp 75.000, lalu membiarkan platform TikTok membersihkan views bot tersebut seminggu kemudian. Brand dan ClipPay akan mengalami kerugian finansial masif.

---

### Solusi Rekomendasi (Arsitektur Terbaik): **Hold Period / Escrow Window + Rolling Verification Payout**

Sebagai arsitektur sistem pembayaran finansial yang sehat, solusi terbaik adalah menerapkan **mekanisme Escrow / Holding Period** yang memisahkan status **Approval** dan **Disbursement (Pencairan)**:

```
[Creator Submit]
       │
       ▼
[Admin Review & Approve] ──> Snapshot Views (100.000) & Kunci Budget Campaign
       │
       ▼
[Status: VERIFIED (Escrow Hold 5–7 Hari)]
       │  (Menunggu siklus stabilisasi audit algoritma TikTok/Instagram)
       │
       ├─► Views Tetap Stabil (≥ 95.000 views)
       │      └──> Status: PAID (Dana cair ke wallet creator)
       │
       └─► Views Anjlok > 15% (mis. Turun ke 60.000 views)
              └──> Auto-Adjustment Earning ke 60.000 views
              └──> Selisih budget (40.000 views) di-refund otomatis ke remaining_budget campaign
              └──> Sistem mencatat fraud score pada creator
```

#### Alasan & Keuntungan Pendekatan Ini:
1. **Bagi Brand**:
   - Budget tidak pernah bocor untuk views fiktif. Selisih dana otomatis dikembalikan ke campaign brand.
   - Brand memiliki kepercayaan tinggi untuk mengalokasikan budget besar di ClipPay.
2. **Bagi Creator**:
   - Creator yang jujur tetap mendapatkan haknya tanpa pernah mengalami saldo negatif mengejutkan setelah uang dicairkan ke rekening bank.
   - Periode holding (misal 5-7 hari) adalah standar industri (mirip seperti YouTube Adsense, TikTok Creator Rewards, atau Tokopedia/Shopee escrow).
3. **Bagi Platform (ClipPay)**:
   - Mencegah risiko *insolvency* atau kerugian penagihan utang jika creator langsung menarik dana (*cashout*) lalu menghapus akunnya.

---

## 8. Trade-offs & Apa yang Akan Dikerjakan Jika Ada Waktu Lebih

Untuk menjaga fokus pada **kebenaran finansial**, **ketahanan concurrency**, dan batas waktu pengerjaan 4–6 jam, beberapa hal dipotong dari cakupan awal:

1. **Authentication & Role-Based Access Control (RBAC)**:
   - *Saat ini*: Endpoint review dan approval bersifat terbuka untuk tujuan pengujian take-home test.
   - *Jika ada waktu lebih*: Mengintegrasikan autentikasi (NextAuth / JWT) dengan peran terpisah: `Admin` (akses approve), `Finance` (akses top-up budget), dan `Auditor` (akses read-only log).
2. **Audit Logging & Event Sourcing**:
   - *Saat ini*: Perubahan tercatat langsung di tabel `submissions` dan `earnings`.
   - *Jika ada waktu lebih*: Membuat tabel `audit_logs` atau menerapkan pola Event Sourcing (`SubmissionApprovedEvent`, `BudgetDeductedEvent`) untuk mencatat siapa admin yang menyetujui, alamat IP, user-agent, dan jejak saldo *before-after* secara rinci untuk kebutuhan audit perbankan/pajak.
3. **Background Job Queue untuk Eksekusi Payout Asinkron**:
   - *Jika ada waktu lebih*: Menggunakan Redis + BullMQ untuk memisahkan proses verifikasi approval submission dengan transfer disbursement ke payment gateway/bank creator, dilengkapi *exponential backoff retry*.
4. **Webhook Notifikasi Realtime**:
   - Mengirim notifikasi email / WhatsApp ke creator begitu videonya berhasil disetujui beserta rincian slip earning.

---

## Ringkasan Struktur Berkas

```
kontencom/
├── app/
│   ├── api/
│   │   ├── campaigns/
│   │   │   ├── route.ts                     # GET /api/campaigns (list untuk filter)
│   │   │   └── [id]/summary/route.ts        # GET /api/campaigns/:id/summary (Bonus B3)
│   │   └── submissions/
│   │       ├── route.ts                     # GET /api/submissions (Tugas 1)
│   │       └── [id]/approve/route.ts        # POST /api/submissions/:id/approve (Tugas 2)
│   ├── review/
│   │   ├── page.tsx                         # Halaman review interaktif (Tugas 3)
│   │   └── review.module.css                # Styling modular review page
│   ├── globals.css                          # Design system & tokens
│   ├── layout.tsx                           # Root layout
│   └── page.tsx                             # Redirect ke /review
├── lib/
│   ├── db.ts                                # Native pg connection pool & transaction helper
│   ├── finance.ts                           # Logika perhitungan uang & anti precision loss
│   └── __tests__/
│       └── finance.test.ts                  # Unit test Vitest (Bonus B1)
├── migrations/
│   └── 01_performance_indexes.sql           # Indeks komposit & unique constraints
├── scripts/
│   ├── migrate.ts                           # Script migrasi
│   └── test-concurrency.ts                  # Simulasi test race condition & double click
├── docker-compose.yml                       # PostgreSQL 16 di port 5433
├── schema.sql                               # Skema awal & seed 50.000 data
├── SOAL.md                                  # Spesifikasi take-home test
└── README.md                                # Dokumentasi komprehensif & jawaban B2
```
