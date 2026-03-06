import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { comment_id, fingerprint } = body;

  if (!comment_id || !fingerprint) {
    return NextResponse.json(
      { error: "Paramètres manquants." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase.from("comment_likes").insert({
    comment_id,
    fingerprint,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Vous avez déjà liké ce commentaire." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors du like." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
