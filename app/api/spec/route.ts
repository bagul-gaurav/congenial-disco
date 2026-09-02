import { NextResponse } from "next/server"
import { z } from "zod"

import { SpecTimeoutError, generateSpec } from "@/ai/spec"

const RequestSchema = z.object({
  description: z.string().min(3).max(2000),
})

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 501 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe the component in a sentence." }, { status: 400 })
  }

  try {
    const spec = await generateSpec({
      description: parsed.data.description,
      apiKey,
      model: process.env.OPENROUTER_MODEL,
      siteUrl: process.env.OPENROUTER_SITE_URL,
      siteName: process.env.OPENROUTER_SITE_NAME,
    })
    return NextResponse.json(spec)
  } catch (error) {
    // A timeout is the caller's to retry, and says something different from a
    // bad key — so it gets its own status rather than a generic bad gateway.
    if (error instanceof SpecTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 504 })
    }
    // The upstream message names the actual problem (bad key, unknown model, a
    // model that cannot do structured outputs), which is what the user needs.
    const message = error instanceof Error ? error.message : "Spec generation failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
