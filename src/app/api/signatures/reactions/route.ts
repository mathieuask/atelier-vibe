import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("signature_likes")
      .select("signature_id, emoji, fingerprint");

    if (error) {
      return NextResponse.json({ reactions: {} });
    }

    // Aggregate: { [signature_id]: { [emoji]: count } }
    const reactions: Record<string, Record<string, number>> = {};
    const userReactions: Record<string, Record<string, string[]>> = {};

    for (const row of data ?? []) {
      if (!reactions[row.signature_id]) reactions[row.signature_id] = {};
      reactions[row.signature_id][row.emoji] = (reactions[row.signature_id][row.emoji] || 0) + 1;

      if (!userReactions[row.signature_id]) userReactions[row.signature_id] = {};
      if (!userReactions[row.signature_id][row.emoji]) userReactions[row.signature_id][row.emoji] = [];
      userReactions[row.signature_id][row.emoji].push(row.fingerprint);
    }

    return NextResponse.json({ reactions, userReactions });
  } catch {
    return NextResponse.json({ reactions: {}, userReactions: {} });
  }
}
