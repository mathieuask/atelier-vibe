import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

const ALLOWED_EMOJIS = ["❤️", "🔥", "👏", "🚀", "💡", "😍"];

export async function POST(request: Request) {
  const body = await request.json();
  const { signature_id, fingerprint, emoji } = body;

  if (!signature_id || !fingerprint || !emoji) {
    return NextResponse.json(
      { error: "Paramètres manquants." },
      { status: 400 }
    );
  }

  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json(
      { error: "Emoji non autorisé." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase.from("signature_likes").insert({
    signature_id,
    fingerprint,
    emoji,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Vous avez déjà réagi avec cet emoji." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la réaction." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const { signature_id, fingerprint, emoji } = body;

  if (!signature_id || !fingerprint || !emoji) {
    return NextResponse.json(
      { error: "Paramètres manquants." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from("signature_likes")
    .delete()
    .eq("signature_id", signature_id)
    .eq("fingerprint", fingerprint)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json(
      { error: "Erreur lors de la suppression." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
