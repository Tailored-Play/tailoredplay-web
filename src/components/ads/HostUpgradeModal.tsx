"use client";

import React, { useState } from "react";
import { MonetizationSettings, PlanType, Profile } from "@/types/database";
import { grantHostEntitlement } from "@/lib/store/platform-store";
import {
  CheckCircle2,
  CreditCard,
  Crown,
  Globe,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

interface HostUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostProfile: Profile;
  partyId?: string;
  monetization: MonetizationSettings;
  onEntitlementGranted: () => Promise<void>;
}

export function HostUpgradeModal({
  isOpen,
  onClose,
  hostProfile,
  partyId,
  monetization,
  onEntitlementGranted,
}: HostUpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("party_pass_24h");
  const [provider, setProvider] = useState<"lemonsqueezy" | "mercadopago">(
    "lemonsqueezy"
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const allPlans: Array<{
    id: PlanType;
    title: string;
    badge: string;
    description: string;
    usd: number;
    ars: number;
    enabled: boolean;
    grantsRewardedFree: boolean;
  }> = [
    {
      id: "party_pass_24h",
      title: "24-Hour Party Pass",
      badge: "One-Time Event",
      description:
        "Removes webpage and in-game ads for every participant in your party for 24 hours.",
      usd: monetization.party_pass_price_usd,
      ars: monetization.party_pass_price_ars,
      enabled: monetization.plan_party_pass_enabled,
      grantsRewardedFree: monetization.plan_party_pass_grants_rewarded_free,
    },
    {
      id: "pro_monthly",
      title: "Corporate Host Pro",
      badge: "Periodical / Monthly",
      description:
        "Unlimited ad-free parties for 30 days across all your team-building and networking sessions.",
      usd: monetization.pro_monthly_price_usd,
      ars: monetization.pro_monthly_price_ars,
      enabled: monetization.plan_pro_monthly_enabled,
      grantsRewardedFree: monetization.plan_pro_monthly_grants_rewarded_free,
    },
    {
      id: "lifetime",
      title: "Lifetime Host Unlock",
      badge: "One-Time Forever",
      description:
        "Permanent ad-free status for every party you ever host on TailoredPlay.",
      usd: monetization.lifetime_price_usd,
      ars: monetization.lifetime_price_ars,
      enabled: monetization.plan_lifetime_enabled,
      grantsRewardedFree: monetization.plan_lifetime_grants_rewarded_free,
    },
  ];
  const availablePlans = allPlans.filter((p) => p.enabled);

  const handleCheckout = async () => {
    setIsProcessing(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: hostProfile.id,
          partyId,
          planType: selectedPlan,
          provider,
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Sandbox / instant grant when payment gateway keys are in local dev mode
      await grantHostEntitlement({
        userId: hostProfile.id,
        planType: selectedPlan,
        provider,
        externalReference: data.reference || `sandbox_${Date.now()}`,
      });

      await onEntitlementGranted();
      setFeedback(
        "Host Ad-Free Pass activated! Ads are now disabled for everyone in your party."
      );
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("[HostUpgradeModal] Checkout error:", err);
      setFeedback("Failed to process checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-xl rounded-3xl border border-amber-500/30 bg-slate-900 p-6 text-slate-100 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/20">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Host-Only Upgrade • Covers Entire Party
            </span>
            <h2 className="mt-0.5 text-xl font-bold text-white">
              Remove Ads for Your Whole Team
            </h2>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-300">
          On TailoredPlay, <strong>guests never pay</strong>. When you upgrade as
          the Party Host, all webpage banners and mid-game commercial breaks are
          instantly disabled for every player in your room.
        </p>

        {/* Currency / Gateway Selector */}
        <div className="mt-4 flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setProvider("lemonsqueezy")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              provider === "lemonsqueezy"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>USD • Lemon Squeezy (Global B2B)</span>
          </button>
          <button
            type="button"
            onClick={() => setProvider("mercadopago")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              provider === "mercadopago"
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>ARS • Mercado Pago (Local)</span>
          </button>
        </div>

        {/* Plans List */}
        <div className="mt-4 space-y-2.5">
          {availablePlans.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-400">
              All paid plans are currently disabled by the system administrator.
            </div>
          ) : (
            availablePlans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const priceDisplay =
                provider === "lemonsqueezy"
                  ? `$${plan.usd.toFixed(2)} USD`
                  : `$${plan.ars.toLocaleString("es-AR")} ARS`;

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`flex w-full items-start justify-between rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-amber-400 bg-amber-500/10"
                      : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                  }`}
                >
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {plan.title}
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        {plan.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {plan.description}
                    </p>
                    {plan.grantsRewardedFree && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <Sparkles className="h-3 w-3" />
                        <span>Instant VIP Rewarded Ad Perks Included</span>
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-extrabold text-amber-300">
                      {priceDisplay}
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          isSelected ? "text-amber-400" : "text-slate-600"
                        }`}
                      />
                      <span>{isSelected ? "Selected" : "Choose"}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {feedback && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
          >
            Continue with Ads
          </button>
          {availablePlans.length > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleCheckout}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              <span>
                {isProcessing
                  ? "Activating Pass..."
                  : `Unlock Ad-Free Party (${
                      provider === "lemonsqueezy" ? "Lemon Squeezy" : "Mercado Pago"
                    })`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
