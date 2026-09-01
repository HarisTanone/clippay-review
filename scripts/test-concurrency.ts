import { pool, query, withTransaction } from "../lib/db";
import { calculateEarnings } from "../lib/finance";

async function runConcurrencyTests() {
  console.log("==================================================");
  console.log(" ClipPay: Test Ketahanan Concurrency & Race Condition");
  console.log("==================================================");

  // 1. Ambil 1 submission pending untuk uji double-click / simultaneous approval
  const pendingSub = await query(
    `SELECT s.id, s.campaign_id, s.views, c.cpm, c.remaining_budget
     FROM submissions s
     JOIN campaigns c ON s.campaign_id = c.id
     WHERE s.status = 'pending' AND c.remaining_budget >= 1000000
     ORDER BY s.id ASC
     LIMIT 1`
  );

  if (pendingSub.rows.length === 0) {
    console.error("Tidak ada data submission pending yang cocok untuk pengujian");
    process.exit(1);
  }

  const targetSubId = Number(pendingSub.rows[0].id);
  console.log(`\n[Test 1] Menembak 5 request approve simultan ke Submission #${targetSubId}...`);

  // Simulasi approval function yang merefleksikan alur app/api/submissions/[id]/approve
  const executeApprove = async (id: number) => {
    try {
      return await withTransaction(async (client) => {
        const subRes = await client.query(
          `SELECT id, creator_id, campaign_id, views, status
           FROM submissions WHERE id = $1 FOR UPDATE`,
          [id]
        );

        const sub = subRes.rows[0];
        if (sub.status !== "pending") {
          return { success: false, status: 409, message: `Sudah diproses (${sub.status})` };
        }

        const campRes = await client.query(
          `SELECT id, cpm, remaining_budget, status
           FROM campaigns WHERE id = $1 FOR UPDATE`,
          [sub.campaign_id]
        );
        const camp = campRes.rows[0];
        const { grossAmount, feeAmount, netAmount } = calculateEarnings(sub.views, camp.cpm);

        if (BigInt(camp.remaining_budget) < BigInt(grossAmount)) {
          return { success: false, status: 422, message: "Budget tidak cukup" };
        }

        await client.query(
          `UPDATE campaigns SET remaining_budget = remaining_budget - $1 WHERE id = $2`,
          [grossAmount, camp.id]
        );

        await client.query(
          `INSERT INTO earnings (submission_id, creator_id, campaign_id, gross_amount, fee_amount, net_amount, views_at_approval)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sub.id, sub.creator_id, camp.id, grossAmount, feeAmount, netAmount, sub.views]
        );

        await client.query(
          `UPDATE submissions SET status = 'approved', reviewed_at = NOW() WHERE id = $1`,
          [sub.id]
        );

        return { success: true, status: 200, message: "Approved successfully", gross: grossAmount };
      });
    } catch (err: any) {
      return { success: false, status: 500, message: err.message };
    }
  };

  // Kirim 5 request approve secara simultan dengan Promise.all
  const results = await Promise.all([
    executeApprove(targetSubId),
    executeApprove(targetSubId),
    executeApprove(targetSubId),
    executeApprove(targetSubId),
    executeApprove(targetSubId),
  ]);

  console.log("Hasil 5 request paralel:");
  results.forEach((res, idx) => {
    console.log(`  Request #${idx + 1}: status=${res.status} (${res.message})`);
  });

  const successCount = results.filter((r) => r.success).length;
  const conflictCount = results.filter((r) => r.status === 409).length;

  console.log(`\nRingkasan Test 1:`);
  console.log(`- Berhasil (200): ${successCount}`);
  console.log(`- Ditolak Konflik (409): ${conflictCount}`);

  if (successCount === 1 && conflictCount === 4) {
    console.log("[PASS] Tepat 1 request berhasil, 4 request dicegah dari duplicate approval!");
  } else {
    console.error("[FAIL] Race condition terdeteksi!");
    process.exit(1);
  }

  // Verifikasi baris earnings di DB
  const earningsCount = await query(
    `SELECT COUNT(*) FROM earnings WHERE submission_id = $1`,
    [targetSubId]
  );
  console.log(`- Jumlah baris earnings di DB: ${earningsCount.rows[0].count} (harus tepat 1)`);
  if (parseInt(earningsCount.rows[0].count, 10) !== 1) {
    console.error("[FAIL] Terjadi duplicate rows di tabel earnings!");
    process.exit(1);
  }

  // 2. Test Budget Exhaustion & No Negative Balance
  console.log("\n[Test 2] Uji Penolakan Saat Budget Campaign 0 / Tidak Cukup...");
  // Campaign 6 di seed memiliki remaining_budget = 0
  const zeroBudgetSub = await query(
    `SELECT s.id, s.views, c.remaining_budget
     FROM submissions s
     JOIN campaigns c ON s.campaign_id = c.id
     WHERE s.status = 'pending' AND c.remaining_budget = 0 AND s.views > 1000
     LIMIT 1`
  );

  if (zeroBudgetSub.rows.length > 0) {
    const zeroSubId = Number(zeroBudgetSub.rows[0].id);
    const zeroRes = await executeApprove(zeroSubId);
    console.log(`- Hasil approve pada campaign budget 0: status=${zeroRes.status} (${zeroRes.message})`);
    if (zeroRes.status === 422) {
      console.log("[PASS] Approval ditolak dengan benar (422) saat budget tidak mencukupi!");
    } else {
      console.error("[FAIL] Approval pada budget 0 tidak ditolak sesuai aturan!");
      process.exit(1);
    }
  }

  // Cek integritas tabel campaigns: apakah ada remaining_budget yang negatif?
  const negativeBudgetCheck = await query(
    `SELECT id, title, remaining_budget FROM campaigns WHERE remaining_budget < 0`
  );
  if (negativeBudgetCheck.rows.length === 0) {
    console.log("[PASS] Tidak ada remaining_budget yang bernilai negatif di seluruh database!");
  } else {
    console.error("[FAIL] Ditemukan campaign dengan budget negatif!");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log(" Semua Pengujian Concurrency Berhasil Sempurna!");
  console.log("==================================================");

  await pool.end();
}

runConcurrencyTests().catch((err) => {
  console.error("Error dalam pengujian concurrency:", err);
  process.exit(1);
});
