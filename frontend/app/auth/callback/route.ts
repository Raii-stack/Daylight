import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "../../../lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next")
  const redirectPath = next?.startsWith("/") ? next : "/"

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(redirectPath, requestUrl.origin))
    }
    console.error("Supabase auth callback failed:", error.message)
  }

  return NextResponse.redirect(
    new URL("/?error=auth_callback_failed", requestUrl.origin),
  )
}
