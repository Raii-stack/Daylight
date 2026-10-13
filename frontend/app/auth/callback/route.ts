import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "../../../lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const authError = requestUrl.searchParams.get("error")
  const authErrorDescription = requestUrl.searchParams.get("error_description")
  const next = requestUrl.searchParams.get("next")
  const redirectPath = next?.startsWith("/") ? next : "/"

  if (authError) {
    const errorUrl = new URL(redirectPath, requestUrl.origin)
    errorUrl.searchParams.set(
      "auth_error",
      authErrorDescription || authError,
    )
    return NextResponse.redirect(errorUrl)
  }

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(redirectPath, requestUrl.origin))
    }
    console.error("Supabase auth callback failed:", error.message)

    const errorUrl = new URL(redirectPath, requestUrl.origin)
    errorUrl.searchParams.set("auth_error", error.message)
    return NextResponse.redirect(errorUrl)
  }

  const errorUrl = new URL(redirectPath, requestUrl.origin)
  errorUrl.searchParams.set("auth_error", "Authentication callback failed.")
  return NextResponse.redirect(errorUrl)
}
