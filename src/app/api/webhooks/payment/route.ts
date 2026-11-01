import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServiceAdminClient } from "@/lib/supabase/server";
import { PlanType } from "@/types/database";

function computeGrantedUntil(planType: PlanType): string {
  const now = Date.now();
  if (planType === "pro_monthly") {
    return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (planType === "lifetime") {
    return new Date(now + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Dual-Webhook endpoint supporting both:
 * 1) Lemon Squeezy (`X-Signature` HMAC-SHA256)
 * 2) Mercado Pago Checkout Pro IPN / Webhooks
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const lemonSignature = req.headers.get("x-signature");
    const urlProvider = req.nextUrl.searchParams.get("provider");

    let provider: "lemonsqueezy" | "mercadopago" =
      lemonSignature || urlProvider === "lemonsqueezy"
        ? "lemonsqueezy"
        : "mercadopago";

    // Optional HMAC verification for Lemon Squeezy
    if (
      provider === "lemonsqueezy" &&
      process.env.LEMONSQUEEZY_WEBHOOK_SECRET &&
      lemonSignature
    ) {
      const hmac = crypto
        .createHmac("sha256", process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
      if (hmac !== lemonSignature) {
        return NextResponse.json(
          { error: "Invalid Lemon Squeezy signature" },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody || "{}");
    let userId: string | undefined;
    let planType: PlanType = "party_pass_24h";
    let externalRef = `webhook_${Date.now()}`;

    if (provider === "lemonsqueezy") {
      const customData = payload?.meta?.custom_data || {};
      userId = customData.user_id || customData.userId;
      planType = (customData.plan_type ||
        customData.planType ||
        "party_pass_24h") as PlanType;
      externalRef = String(payload?.data?.id || externalRef);
    } else {
      // Mercado Pago webhook payload
      provider = "mercadopago";
      externalRef = String(payload?.data?.id || payload?.id || externalRef);

      if (payload?.external_reference) {
        try {
          const parsed = JSON.parse(payload.external_reference);
          userId = parsed.userId || parsed.user_id;
          planType = (parsed.planType || "party_pass_24h") as PlanType;
        } catch {
          userId = payload.user_id;
        }
      } else {
        userId = payload?.user_id || payload?.metadata?.user_id;
        planType = (payload?.plan_type ||
          payload?.metadata?.plan_type ||
          "party_pass_24h") as PlanType;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { received: true, note: "No userId in webhook metadata" },
        { status: 200 }
      );
    }

    const grantedUntil = computeGrantedUntil(planType);
    const supabaseAdmin = getSupabaseServiceAdminClient();

    if (supabaseAdmin) {
      await supabaseAdmin.from("entitlement_logs").insert({
        user_id: userId,
        provider,
        plan_type: planType,
        external_reference: externalRef,
        granted_until: grantedUntil,
      });

      await supabaseAdmin
        .from("profiles")
        .update({ ad_free_until: grantedUntil })
        .eq("id", userId);
    }

    return NextResponse.json({
      ok: true,
      provider,
      userId,
      planType,
      grantedUntil,
    });
  } catch (err) {
    console.error("[/api/webhooks/payment] Error:", err);
    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500 }
    );
  }
}
