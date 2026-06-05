import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasKey = !!process.env.RESEND_API_KEY
  const keyPrefix = process.env.RESEND_API_KEY?.slice(0, 8) ?? 'not set'

  // Try sending a test email
  let resendResponse = null
  let resendError = null
  if (hasKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: ['otoubia@yahoo.com'],
          subject: 'Scrap Yard Fan Club - Email Test',
          html: '<p>This is a test email from the Scrap Yard Fan Club admin debug tool.</p><p><a href="https://scrapyard-fanclub.vercel.app/admin">Go to admin →</a></p>',
        }),
      })
      resendResponse = await res.json()
    } catch (e: any) {
      resendError = e.message
    }
  }

  return NextResponse.json({ hasKey, keyPrefix, resendResponse, resendError })
}
