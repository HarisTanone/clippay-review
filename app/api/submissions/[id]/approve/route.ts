import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { calculateEarnings } from "@/lib/finance";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const submissionId = parseInt(id, 10);

    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return NextResponse.json(
        { error: "ID submission tidak valid" },
        { status: 400 }
      );
    }

    // Eksekusi seluruh operasi di dalam database transaction terisolasi
    const result = await withTransaction(async (client) => {
      // 1. Kunci baris submission dengan FOR UPDATE untuk mencegah concurrent approval & double click
      const submissionRes = await client.query(
        `SELECT id, creator_id, campaign_id, platform, video_url, views, status
         FROM submissions
         WHERE id = $1
         FOR UPDATE`,
        [submissionId]
      );

      if (submissionRes.rows.length === 0) {
        throw new ApiError(404, "Submission tidak ditemukan");
      }

      const submission = submissionRes.rows[0];

      // Validasi status: hanya submission 'pending' yang boleh di-approve
      if (submission.status === "approved") {
        throw new ApiError(
          409,
          "Submission ini sudah disetujui sebelumnya. Tidak boleh menghasilkan earning kedua."
        );
      }

      if (submission.status === "rejected") {
        throw new ApiError(
          400,
          "Submission ini sudah ditolak sebelumnya dan tidak dapat disetujui."
        );
      }

      if (submission.status !== "pending") {
        throw new ApiError(
          400,
          `Status submission tidak valid untuk approval: ${submission.status}`
        );
      }

      // 2. Kunci baris campaign dengan FOR UPDATE
      // Ini memastikan pengurangan remaining_budget aman dari race condition multi-admin
      const campaignRes = await client.query(
        `SELECT id, title, brand, cpm, remaining_budget, status
         FROM campaigns
         WHERE id = $1
         FOR UPDATE`,
        [submission.campaign_id]
      );

      if (campaignRes.rows.length === 0) {
        throw new ApiError(404, "Campaign terkait tidak ditemukan");
      }

      const campaign = campaignRes.rows[0];
      const remainingBudget = BigInt(campaign.remaining_budget);

      // Cek status campaign
      if (campaign.status !== "active") {
        throw new ApiError(
          400,
          `Campaign '${campaign.title}' sedang berstatus '${campaign.status}'. Hanya campaign 'active' yang dapat memproses approval.`
        );
      }

      // 3. Hitung earning creator dan fee platform
      const earnings = calculateEarnings(submission.views, campaign.cpm);
      const grossBigInt = BigInt(earnings.grossAmount);

      // 4. Validasi budget: remaining_budget TIDAK BOLEH menjadi negatif
      // Kalau budget tidak cukup untuk membayar penuh, tolak approve (jangan bayar sebagian)
      if (remainingBudget < grossBigInt) {
        throw new ApiError(
          422,
          `Sisa budget campaign tidak mencukupi. Diperlukan Rp${earnings.grossAmount.toLocaleString(
            "id-ID"
          )}, namun sisa budget hanya Rp${Number(remainingBudget).toLocaleString(
            "id-ID"
          )}. Approval ditolak.`
        );
      }

      // 5. Potong remaining_budget campaign sebesar earning_kotor
      const updatedCampaignRes = await client.query(
        `UPDATE campaigns
         SET remaining_budget = remaining_budget - $1
         WHERE id = $2
         RETURNING remaining_budget`,
        [earnings.grossAmount, campaign.id]
      );

      const newRemainingBudget = Number(
        updatedCampaignRes.rows[0].remaining_budget
      );

      // 6. Simpan baris di tabel earnings
      const insertEarningRes = await client.query(
        `INSERT INTO earnings (
          submission_id,
          creator_id,
          campaign_id,
          gross_amount,
          fee_amount,
          net_amount,
          views_at_approval,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, created_at`,
        [
          submission.id,
          submission.creator_id,
          campaign.id,
          earnings.grossAmount,
          earnings.feeAmount,
          earnings.netAmount,
          submission.views,
        ]
      );

      const earningRow = insertEarningRes.rows[0];

      // 7. Ubah status submission menjadi 'approved' dan set reviewed_at
      await client.query(
        `UPDATE submissions
         SET status = 'approved',
             reviewed_at = NOW()
         WHERE id = $1`,
        [submission.id]
      );

      return {
        message: "Submission berhasil disetujui",
        submission_id: submission.id,
        status: "approved",
        earning: {
          id: Number(earningRow.id),
          gross_amount: earnings.grossAmount,
          fee_amount: earnings.feeAmount,
          net_amount: earnings.netAmount,
          views_at_approval: submission.views,
          created_at: earningRow.created_at,
        },
        campaign: {
          id: campaign.id,
          title: campaign.title,
          previous_budget: Number(remainingBudget),
          new_remaining_budget: newRemainingBudget,
        },
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Unexpected error in approve submission:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server", details: error.message },
      { status: 500 }
    );
  }
}
