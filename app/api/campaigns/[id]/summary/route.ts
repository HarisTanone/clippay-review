import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const campaignId = parseInt(id, 10);

    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return NextResponse.json(
        { error: "ID campaign tidak valid" },
        { status: 400 }
      );
    }

    // Query ringkasan dengan efisiensi maksimal menggunakan Index Scan & Filter Aggregation
    const sql = `
      SELECT
        cmp.id,
        cmp.title,
        cmp.brand,
        cmp.cpm,
        cmp.total_budget,
        cmp.remaining_budget,
        cmp.status,
        cmp.created_at,
        COALESCE(sub.total_submissions, 0)::bigint AS total_submissions,
        COALESCE(sub.total_pending, 0)::bigint AS total_pending,
        COALESCE(sub.total_approved, 0)::bigint AS total_approved,
        COALESCE(sub.total_rejected, 0)::bigint AS total_rejected,
        COALESCE(earn.total_gross_paid, 0)::bigint AS total_gross_paid,
        COALESCE(earn.total_fee_collected, 0)::bigint AS total_fee_collected,
        COALESCE(earn.total_net_paid, 0)::bigint AS total_net_paid
      FROM campaigns cmp
      LEFT JOIN (
        SELECT
          campaign_id,
          COUNT(*) AS total_submissions,
          COUNT(*) FILTER (WHERE status = 'pending') AS total_pending,
          COUNT(*) FILTER (WHERE status = 'approved') AS total_approved,
          COUNT(*) FILTER (WHERE status = 'rejected') AS total_rejected
        FROM submissions
        WHERE campaign_id = $1
        GROUP BY campaign_id
      ) sub ON sub.campaign_id = cmp.id
      LEFT JOIN (
        SELECT
          campaign_id,
          COALESCE(SUM(gross_amount), 0) AS total_gross_paid,
          COALESCE(SUM(fee_amount), 0) AS total_fee_collected,
          COALESCE(SUM(net_amount), 0) AS total_net_paid
        FROM earnings
        WHERE campaign_id = $1
        GROUP BY campaign_id
      ) earn ON earn.campaign_id = cmp.id
      WHERE cmp.id = $1
    `;

    const result = await query(sql, [campaignId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Campaign tidak ditemukan" },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    return NextResponse.json({
      campaign: {
        id: Number(row.id),
        title: row.title,
        brand: row.brand,
        cpm: Number(row.cpm),
        total_budget: Number(row.total_budget),
        remaining_budget: Number(row.remaining_budget),
        spent_budget: Number(row.total_budget) - Number(row.remaining_budget),
        status: row.status,
        created_at: row.created_at,
      },
      submissions_summary: {
        total: Number(row.total_submissions),
        pending: Number(row.total_pending),
        approved: Number(row.total_approved),
        rejected: Number(row.total_rejected),
      },
      earnings_summary: {
        total_gross_paid: Number(row.total_gross_paid),
        total_platform_fee: Number(row.total_fee_collected),
        total_net_paid: Number(row.total_net_paid),
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns/:id/summary:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
