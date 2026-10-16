import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      message: "Received!",
      received: body
    });
  } catch {
    return NextResponse.json({
      success: true,
      message: "Received but could not parse JSON"
    });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Test webhook endpoint" });
}
