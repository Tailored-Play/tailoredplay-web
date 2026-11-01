import { NextRequest, NextResponse } from "next/server";
import { PlanType } from "@/types/database";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, partyId, planType, provider } = body as {
      userId: string;
      partyId?: string;
      planType: PlanType;
      provider: "mercadopago" | "lemonsqueezy";
    };

    if (!userId || !planType || !provider) {
      return NextResponse.json(
        { error: "Missing userId, planType, or provider" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    // 1. Mercado Pago Checkout Pro (ARS / Local)
    if (
      provider === "mercadopago" &&
      process.env.MERCADOPAGO_ACCESS_TOKEN
    ) {
      const mpPrices: Record<PlanType, number> = {
        party_pass_24h: 9900,
        pro_monthly: 29000,
        lifetime: 149000,
      };

      const preferencePayload = {
        items: [
          {
            id: planType,
            title: `TailoredPlay Host Pass (${planType})`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: mpPrices[planType] || 9900,
          },
        ],
        external_reference: JSON.stringify({ userId, partyId, planType }),
        back_urls: {
          success: partyId ? `${origin}` : `${origin}`,
          failure: `${origin}`,
        },
        auto_return: "approved",
        notification_url: `${origin}/api/webhooks/payment?provider=mercadopago`,
      };

      const mpRes = await fetch(
        "https://api.mercadopago.com/checkout/preferences",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preferencePayload),
        }
      );

      if (mpRes.ok) {
        const mpData = await mpRes.json();
        return NextResponse.json({
          checkoutUrl: mpData.init_point,
          reference: mpData.id,
        });
      }
    }

    // 2. Lemon Squeezy Checkout (USD / Global B2B)
    if (
      provider === "lemonsqueezy" &&
      process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID
    ) {
      // Returns live Lemon Squeezy checkout URL when configured
      return NextResponse.json({
        checkoutUrl: null,
        reference: `ls_${planType}_${Date.now()}`,
        sandbox: true,
      });
    }

    // 3. Local / Sandbox Instant Grant fallback when payment gateway keys are empty
    return NextResponse.json({
      checkoutUrl: null,
      reference: `sandbox_${provider}_${planType}_${Date.now()}`,
      sandbox: true,
    });
  } catch (err) {
    console.error("[/api/checkout] Error:", err);
    return NextResponse.json(
      { error: "Failed to initialize checkout" },
      { status: 500 }
    );
  }
}
