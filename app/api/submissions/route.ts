import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calculateEarnings } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. Parse & validasi pagination
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const perParam = parseInt(searchParams.get("per") || "20", 10);

    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const per =
      Number.isFinite(perParam) && perParam > 0
        ? Math.min(perParam, 100)
        : 20;
    const offset = (page - 1) * per;

    // 2. Parse filter
    const statusParam = searchParams.get("status")?.trim().toLowerCase();
    const campaignIdParam = searchParams.get("campaignId")?.trim();
    const searchParam = searchParams.get("search")?.trim();

    const validStatuses = ["pending", "approved", "rejected"];
    const status = validStatuses.includes(statusParam || "")
      ? statusParam
      : undefined;

    const campaignId =
      campaignIdParam && !Number.isNaN(parseInt(campaignIdParam, 10))
        ? parseInt(campaignIdParam, 10)
        : undefined;

    // 3. Bangun kondisi WHERE secara dinamis & aman (parameterized)
    const whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`s.status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (campaignId !== undefined) {
      whereConditions.push(`s.campaign_id = $${paramIndex++}`);
      queryParams.push(campaignId);
    }

    if (searchParam) {
      // Search by creator username (case-insensitive prefix / substring)
      whereConditions.push(`c.username ILIKE $${paramIndex++}`);
      queryParams.push(`%${searchParam}%`);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // 4. Hitung TOTAL baris secara efisien
    // Jika tidak ada filter search by creator, kita tidak perlu JOIN creators pada query COUNT
    let countSql: string;
    let countParams: any[];

    if (searchParam) {
      countSql = `
        SELECT COUNT(*)::bigint AS total
        FROM submissions s
        JOIN creators c ON s.creator_id = c.id
        ${whereClause}
      `;
      countParams = [...queryParams];
    } else {
      // Sub-conditions tanpa alias s. jika hanya dari submissions
      const countConditions: string[] = [];
      const cParams: any[] = [];
      let cIndex = 1;

      if (status) {
        countConditions.push(`status = $${cIndex++}`);
        cParams.push(status);
      }
      if (campaignId !== undefined) {
        countConditions.push(`campaign_id = $${cIndex++}`);
        cParams.push(campaignId);
      }

      const countWhere =
        countConditions.length > 0
          ? `WHERE ${countConditions.join(" AND ")}`
          : "";

      countSql = `SELECT COUNT(*)::bigint AS total FROM submissions ${countWhere}`;
      countParams = cParams;
    }

    // 5. Query Data Submissions dengan Pagination
    const dataSql = `
      SELECT
        s.id,
        s.creator_id,
        c.username AS creator_username,
        c.email AS creator_email,
        s.campaign_id,
        cmp.title AS campaign_title,
        cmp.brand AS campaign_brand,
        cmp.cpm AS campaign_cpm,
        cmp.remaining_budget AS campaign_remaining_budget,
        cmp.status AS campaign_status,
        s.platform,
        s.video_url,
        s.views,
        s.status,
        s.submitted_at,
        s.reviewed_at
      FROM submissions s
      JOIN creators c ON s.creator_id = c.id
      JOIN campaigns cmp ON s.campaign_id = cmp.id
      ${whereClause}
      ORDER BY s.submitted_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...queryParams, per, offset];

    // Eksekusi count & data secara paralel menggunakan connection pool
    const [countResult, dataResult] = await Promise.all([
      query<{ total: string }>(countSql, countParams),
      query(dataSql, dataParams),
    ]);

    const total = parseInt(countResult.rows[0]?.total || "0", 10);
    const totalPages = Math.ceil(total / per);

    // Format output data dan sertakan rincian earning potensial
    const rows = dataResult.rows.map((row) => {
      const breakdown = calculateEarnings(row.views, row.campaign_cpm);
      return {
        id: Number(row.id),
        creator: {
          id: Number(row.creator_id),
          username: row.creator_username,
          email: row.creator_email,
        },
        campaign: {
          id: Number(row.campaign_id),
          title: row.campaign_title,
          brand: row.campaign_brand,
          cpm: Number(row.campaign_cpm),
          remaining_budget: Number(row.campaign_remaining_budget),
          status: row.campaign_status,
        },
        platform: row.platform,
        video_url: row.video_url,
        views: Number(row.views),
        status: row.status,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at,
        calculation: {
          gross: breakdown.grossAmount,
          fee: breakdown.feeAmount,
          net: breakdown.netAmount,
        },
      };
    });

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        per,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/submissions:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
