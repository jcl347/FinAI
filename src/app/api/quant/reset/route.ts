import { NextRequest, NextResponse } from "next/server";
import { resetQuant } from "@/lib/quant-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/quant/reset — wipe the automated book and restart from a clean capital base.
 * Body: { initialCapital?: number }  (default 100000)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const initialCapital = Number(body.initialCapital ?? 100000);
    if (!(initialCapital > 0)) {
      return NextResponse.json({ error: "initialCapital must be positive" }, { status: 400 });
    }
    const book = await resetQuant(initialCapital);
    if (book === null) {
      return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
    }
    return NextResponse.json({ status: "reset", book });
  } catch (err) {
    console.error("[quant/reset] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "reset failed" },
      { status: 500 }
    );
  }
}
