import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { calculateNormalizedPartyPoints } from "@/lib/identity";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partyId,
      gameId,
      userId,
      roundNumber = 1,
      scoreValue = 0,
      metadata = {},
    } = body;

    if (!partyId || !gameId || !userId) {
      return NextResponse.json(
        { error: "Missing partyId, gameId, or userId" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data: inserted, error } = await supabase
        .from("scores")
        .insert({
          party_id: partyId,
          game_id: gameId,
          user_id: userId,
          round_number: roundNumber,
          score_value: scoreValue,
          party_points: calculateNormalizedPartyPoints(0),
          metadata,
        })
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ score: inserted });
    }

    return NextResponse.json({
      ok: true,
      mode: "client_sync",
    });
  } catch (err) {
    console.error("[/api/scores] Error:", err);
    return NextResponse.json(
      { error: "Failed to record score" },
      { status: 500 }
    );
  }
}
