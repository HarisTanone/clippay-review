import { describe, it, expect } from "vitest";
import {
  calculateEarnings,
  formatRupiah,
  formatNumber,
  PLATFORM_FEE_RATE,
} from "../finance";

describe("calculateEarnings (ClipPay Financial Logic)", () => {
  it("menghitung contoh resmi dari SOAL.md dengan tepat (12.345 views, CPM Rp1.500)", () => {
    // 12.345 / 1000 = 12.345
    // 12.345 * 1500 = 18517.5 -> floor = 18.517 (gross)
    // 18.517 * 0.2 = 3703.4 -> ceil = 3.704 (fee 20%)
    // 18.517 - 3.704 = 14.813 (net)
    const result = calculateEarnings(12345, 1500);

    expect(result.grossAmount).toBe(18517);
    expect(result.feeAmount).toBe(3704);
    expect(result.netAmount).toBe(14813);
    expect(result.grossAmount).toBe(result.feeAmount + result.netAmount);
  });

  it("menangani views 0 dengan menghasilkan 0 untuk semua komponen", () => {
    const result = calculateEarnings(0, 2000);
    expect(result.grossAmount).toBe(0);
    expect(result.feeAmount).toBe(0);
    expect(result.netAmount).toBe(0);
  });

  it("menangani views kecil (< 1.000 views) dengan presisi", () => {
    // 500 views, CPM 1500 -> (500 / 1000) * 1500 = 750
    const r1 = calculateEarnings(500, 1500);
    expect(r1.grossAmount).toBe(750);
    expect(r1.feeAmount).toBe(150);
    expect(r1.netAmount).toBe(600);
    expect(r1.grossAmount).toBe(r1.feeAmount + r1.netAmount);

    // 1 view, CPM 1500 -> floor(1.5) = 1 -> fee ceil(0.2) = 1 -> net 0
    const r2 = calculateEarnings(1, 1500);
    expect(r2.grossAmount).toBe(1);
    expect(r2.feeAmount).toBe(1);
    expect(r2.netAmount).toBe(0);
    expect(r2.grossAmount).toBe(r2.feeAmount + r2.netAmount);

    // 1 view, CPM 500 -> floor(0.5) = 0 -> gross 0, fee 0, net 0
    const r3 = calculateEarnings(1, 500);
    expect(r3.grossAmount).toBe(0);
    expect(r3.feeAmount).toBe(0);
    expect(r3.netAmount).toBe(0);
  });

  it("menangani kelipatan pas (mis. 10.000 views, CPM Rp2.000)", () => {
    const result = calculateEarnings(10000, 2000);
    expect(result.grossAmount).toBe(20000);
    expect(result.feeAmount).toBe(4000);
    expect(result.netAmount).toBe(16000);
    expect(result.grossAmount).toBe(result.feeAmount + result.netAmount);
  });

  it("menangani volume besar (viral video 15.000.000 views, CPM Rp2.500)", () => {
    const result = calculateEarnings(15000000, 2500);
    expect(result.grossAmount).toBe(37500000);
    expect(result.feeAmount).toBe(7500000);
    expect(result.netAmount).toBe(30000000);
    expect(result.grossAmount).toBe(result.feeAmount + result.netAmount);
  });

  it("menjamin invarian finansial: grossAmount === feeAmount + netAmount pada 200 kombinasi acak", () => {
    for (let i = 0; i < 200; i++) {
      const randomViews = Math.floor(Math.random() * 5000000);
      const randomCpm = Math.floor(Math.random() * 10000) + 100;

      const result = calculateEarnings(randomViews, randomCpm);
      expect(result.grossAmount).toBe(result.feeAmount + result.netAmount);
      expect(result.grossAmount).toBeGreaterThanOrEqual(0);
      expect(result.feeAmount).toBeGreaterThanOrEqual(0);
      expect(result.netAmount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.grossAmount)).toBe(true);
      expect(Number.isInteger(result.feeAmount)).toBe(true);
      expect(Number.isInteger(result.netAmount)).toBe(true);
    }
  });

  it("menolak input tidak valid (views negatif atau CPM tidak valid)", () => {
    expect(() => calculateEarnings(-10, 1500)).toThrow(/Views tidak valid/);
    expect(() => calculateEarnings(1000, 0)).toThrow(/CPM tidak valid/);
    expect(() => calculateEarnings(1000, -500)).toThrow(/CPM tidak valid/);
    expect(() => calculateEarnings(NaN, 1500)).toThrow(/Views tidak valid/);
    expect(() => calculateEarnings(1000, Infinity)).toThrow(/CPM tidak valid/);
  });
});

describe("Formatters", () => {
  it("formatRupiah memformat angka ke format IDR", () => {
    const formatted = formatRupiah(18517);
    expect(formatted).toContain("18.517");
  });

  it("formatNumber memformat angka ribuan", () => {
    const formatted = formatNumber(12345);
    expect(formatted).toBe("12.345");
  });
});
