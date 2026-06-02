import { NextResponse } from "next/server";
import { getQuantState } from "@/lib/quant-db";

export const dynamic = "force-dynamic";

/** GET /api/quant/state — full dashboard state for the automated multi-strategy book. */
export async function GET() {
  try {
    const state = await getQuantState();
    if (state === null) {
      return NextResponse.json({ configured: false, error: "DATABASE_URL not configured" }, { status: 200 });
    }
    return NextResponse.json(state);
  } catch (err) {
    console.error("[quant/state] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to load quant state" },
      { status: 500 }
    );
  }
}
