import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query(
      `SELECT id, title, brand, cpm, remaining_budget, total_budget, status
       FROM campaigns
       ORDER BY id ASC`
    );

    const campaigns = result.rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      brand: row.brand,
      cpm: Number(row.cpm),
      remaining_budget: Number(row.remaining_budget),
      total_budget: Number(row.total_budget),
      status: row.status,
    }));

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
