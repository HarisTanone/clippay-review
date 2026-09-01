/**
 * Logika perhitungan finansial ClipPay
 *
 * Aturan sesuai SOAL.md:
 * - earning_kotor = floor(views / 1000 * cpm)
 * - fee_platform  = 20%
 * - earning_net   = earning_kotor - fee_platform
 *
 * Contoh dari soal:
 * 12.345 views, CPM Rp1.500:
 * - gross = floor(12.345 * 1.500) = 18.517
 * - fee   = ceil(18.517 * 0.20) = 3.704
 * - net   = 18.517 - 3.704 = 14.813
 *
 * Invarian finansial: grossAmount === feeAmount + netAmount
 */

export interface EarningsBreakdown {
  views: number;
  cpm: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
}

export const PLATFORM_FEE_RATE = 0.2; // 20%

/**
 * Menghitung rincian earning creator dan fee platform
 * @param views Jumlah views video (harus integer >= 0)
 * @param cpm Cost Per Mille dalam Rupiah (harus integer > 0)
 * @returns EarningsBreakdown
 */
export function calculateEarnings(views: number, cpm: number): EarningsBreakdown {
  if (!Number.isFinite(views) || views < 0) {
    throw new Error(`Views tidak valid: ${views}. Harus angka non-negatif.`);
  }

  if (!Number.isFinite(cpm) || cpm <= 0) {
    throw new Error(`CPM tidak valid: ${cpm}. Harus angka positif.`);
  }

  // Views dan CPM dibulatkan ke integer jika ada desimal input
  const safeViews = Math.floor(views);
  const safeCpm = Math.floor(cpm);

  // earning_kotor = floor((views * cpm) / 1000)
  // Catatan: Perkalian views * cpm dilakukan terlebih dahulu sebelum dibagi 1000
  // untuk mencegah floating point precision loss (IEEE 754) seperti (1132 / 1000) * 2500 = 2829.9999999999995.
  const grossAmount = Math.floor((safeViews * safeCpm) / 1000);

  if (grossAmount <= 0) {
    return {
      views: safeViews,
      cpm: safeCpm,
      grossAmount: 0,
      feeAmount: 0,
      netAmount: 0,
    };
  }

  // fee_platform = 20% dibulatkan ke atas (ceil) sehingga netAmount = floor(gross * 0.8)
  // Menjamin invarian: grossAmount === feeAmount + netAmount tanpa penny leak
  const feeAmount = Math.ceil(grossAmount * PLATFORM_FEE_RATE);
  const netAmount = grossAmount - feeAmount;

  return {
    views: safeViews,
    cpm: safeCpm,
    grossAmount,
    feeAmount,
    netAmount,
  };
}

/**
 * Format angka ke format mata uang Rupiah
 * Contoh: 18517 -> "Rp 18.517"
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format angka ribuan biasa
 * Contoh: 12345 -> "12.345"
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}
