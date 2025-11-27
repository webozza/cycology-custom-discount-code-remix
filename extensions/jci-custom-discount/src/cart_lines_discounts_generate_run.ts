import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

// Helpers
const toNum = (v: any) => Number.parseFloat(String(v ?? "0"));

// Update Line type to include product.id (needed for eligibleProductIds checks)
type Line = {
  id: string;
  quantity?: number; // default to 1 if absent
  attribute?: { value: string };
  cart?: { subtotalAmount?: { amount?: string } };
  cost?: {
    subtotalAmount?: { amount?: number };
    totalAmount?: { amount?: number };
  };
  merchandise?: {
    __typename?: string;
    id?: string;
    product?: {
      id?: string; // ⬅️ used to match against eligibleProductIds
      metafield?: { value: string };
      // inCollections intentionally unused (you asked to drop collection checks)
    };
  };
};

// Legacy config support (kept)
type LegacyConfig = {
  type?: "percentage" | "amount";
  value?: {
    percentage?: number;        // 0..1 or 0..100 legacy
    amount?: string | number;   // "10.00"
    currencyCode?: string;
  };
  conditions?: { minimumSubtotal?: string | number | null };
};

// New config (now based on product IDs, not collections)
type NewConfig = {
  kind?: "ORDER_AMOUNT" | "PRODUCT_AMOUNT" | "BXGY";
  value?: {
    type?: "PERCENT" | "AMOUNT";
    percent?: number | null;              // 0..1 preferred, 0..100 tolerated
    amount?: string | number | null;
    currencyCode?: string | null;
  };
  // ORDER (now product-based condition)
  conditions?: {
    minimumSubtotal?: string | number | null;
    requiresProducts?: { eligibleProductIds?: string[] | null } | null;
  };
  // PRODUCT (target by product IDs)
  target?: {
    scope?: "ALL" | "PRODUCTS";
    eligibleProductIds?: string[] | null;
  };
  // BXGY (buy/get by product IDs)
  buy?: {
    quantity?: number;
    scope?: "ALL" | "PRODUCTS";
    eligibleProductIds?: string[] | null;
  };
  get?: {
    quantity?: number;
    scope?: "ALL" | "PRODUCTS";
    eligibleProductIds?: string[] | null;
    effect?:
      | { type: "FREE" }
      | { type: "PERCENT"; percent: number }
      | { type: "AMOUNT"; amount: string | number; currencyCode?: string | null };
  };
  application?: { repeats?: boolean; maxRepeatsPerOrder?: number | null };
};

type Config = LegacyConfig & NewConfig;
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  const lines = (input.cart.lines as unknown as Line[]) || [];
  if (!lines.length) throw new Error("No cart lines found");

  // Must include ORDER class (your server sets this for order/product/bxgy)
  if (!(input.discount.discountClasses || []).includes(DiscountClass.Order)) {
    return { operations: [] };
  }

  const cfg = (input.discount?.metafield?.jsonValue as Config) ?? {};


  // Convenience getter for a line's product ID
  const getProductId = (l: Line) => String(l.merchandise?.product?.id ?? "");
  
  // ---- Your exclusion logic (kept exactly)
  const hasDiscountProd = (l: Line) =>
    (l.merchandise?.product?.metafield?.value || l?.attribute?.value) ? true : false;

  const hasEligible = (l: Line): boolean => {
    if(cfg.conditions?.requiresProducts?.eligibleProductIds === undefined) {
      return !hasDiscountProd(l);
    }
    // You can implement your logic here to check if the line matches the eligible product IDs
    const eligibleProductIds = cfg.conditions?.requiresProducts?.eligibleProductIds ?? [];
    const eligibleSet = new Set(eligibleProductIds.map(String));
    return eligibleSet.has(getProductId(l)) && !hasDiscountProd(l);
  };


  const eligible = lines.filter((l) => hasEligible(l));
  const excluded = lines.filter((l) => !hasEligible(l)).map((l) => l.id);

  if (eligible.length === 0) return { operations: [] };
  // ---------------------------------------

  const cartSubtotal = toNum(input.cart?.cost?.subtotalAmount?.amount);
  const normalizePct = (n: any) => {
    const raw = Number(n ?? 0);
    return raw <= 1 ? raw * 100 : raw; // accept 0..1 or 0..100
  };

  const makeValue = (localCfg = cfg):
    | { percentage?: { value: number }; fixedAmount?: { amount: number } }
    | null => {
    // Prefer new
    if (localCfg.value?.type === "AMOUNT") {
      const amt = toNum(localCfg.value?.amount);
      return amt > 0 ? { fixedAmount: { amount: amt } } : null;
    }
    if (localCfg.value?.type === "PERCENT") {
      const pct = normalizePct(localCfg.value?.percent);
      return pct > 0 && pct <= 100 ? { percentage: { value: pct } } : null;
    }
    // Legacy fallback
    if (localCfg.type === "amount") {
      const amt = toNum(localCfg.value?.amount);
      return amt > 0 ? { fixedAmount: { amount: amt } } : null;
    } else {
      const pct = normalizePct(localCfg.value?.percentage);
      return pct > 0 && pct <= 100 ? { percentage: { value: pct } } : null;
    }
  };

  // ---------- ORDER_AMOUNT (product-based requires) ----------
  if (!cfg.kind || cfg.kind === "ORDER_AMOUNT") {
    // Minimum subtotal
    const minSubtotal = toNum(cfg.conditions?.minimumSubtotal ?? 0);
    if (cartSubtotal < minSubtotal) return { operations: [] };

    // Requires products: at least one eligible line must match
    const requiredProductIds = cfg.conditions?.requiresProducts?.eligibleProductIds ?? [];
    if (Array.isArray(requiredProductIds) && requiredProductIds.length > 0) {
      const requiredSet = new Set(requiredProductIds.map(String));
      const hasAnyRequired = eligible.some((l) => requiredSet.has(getProductId(l)));
      if (!hasAnyRequired) return { operations: [] };
    }

    const value = makeValue();
    if (!value) return { operations: [] };

    let totalDiscountValue = 0;
    const totalEligableAmount = eligible.reduce((sum, l) => {
      return sum+toNum(l.cost?.totalAmount?.amount);
    }, 0); 

    const lineValue = makeValue(cfg);
    if (lineValue) {
      if ("fixedAmount" in lineValue) {
        totalDiscountValue += toNum(lineValue.fixedAmount.amount); // Sum the fixed amount discount
      } else if ("percentage" in lineValue) {
        if (totalEligableAmount > 0) {
          totalDiscountValue += toNum(totalEligableAmount * lineValue.percentage.value) / 100; // Sum the percentage discount
        }
      }
    }
    
    console.log(eligible.map(v => v.cost?.totalAmount?.amount), totalEligableAmount)

    if (totalDiscountValue <= 0) return { operations: [] };

    const prettyMsg = `Code: Discount of ${totalDiscountValue.toFixed(2)} off (excluding already-discounted items)`;

    return {
      operations: [
        {
          orderDiscountsAdd: {
            selectionStrategy: OrderDiscountSelectionStrategy.First,
            candidates: [
              {
                message: prettyMsg,
                targets: [
                  {
                    orderSubtotal: { excludedCartLineIds: excluded },
                  },
                ],
                value: {
                  fixedAmount: { amount: totalDiscountValue }, // Apply total discount
                },
              },
            ],
          },
        },
      ],
    };
  }

  // ---------- PRODUCT_AMOUNT (scope: ALL or PRODUCTS with eligibleProductIds) ----------
  if (cfg.kind === "PRODUCT_AMOUNT") {
    const scope = cfg.target?.scope ?? "ALL";
    const eligibleProductIds = cfg.target?.eligibleProductIds ?? [];
    const eligibleSet = new Set((eligibleProductIds ?? []).map(String));

    const value = makeValue();
    if (!value) return { operations: [] };

    const targetLines = eligible.filter((l) => {
      if (scope === "ALL") return true;
      return eligibleSet.has(getProductId(l));
    });
    if (targetLines.length === 0) return { operations: [] };

    const shownPct =
      "percentage" in (value as any)
        ? (value as any).percentage.value
        : normalizePct((cfg.value as any)?.percent ?? (cfg.value as any)?.percentage ?? 0);

    const prettyMsg =
      "fixedAmount" in (value as any)
        ? `Code: ${toNum(cfg.value?.amount ?? 0).toFixed(2)} off`
        : `Code: ${shownPct.toFixed(0)}% off`;

    return {
      operations: [
        {
          cartLinesDiscountsAdd: {
            targets: targetLines.map((l) => ({ cartLine: { id: l.id } })),
            value,
            message: prettyMsg,
          },
        } as any,
      ],
    };
  }

  // ---------- BXGY (buy/get by eligibleProductIds) ----------
  if (cfg.kind === "BXGY") {
    const buyQtyNeeded = Math.max(1, toNum(cfg.buy?.quantity ?? 1));
    const getQty = Math.max(1, toNum(cfg.get?.quantity ?? 1));
    const repeats = Boolean(cfg.application?.repeats);
    const maxRepeats = cfg.application?.maxRepeatsPerOrder ?? null;

    const buyScope = cfg.buy?.scope ?? "ALL";
    const buySet = new Set((cfg.buy?.eligibleProductIds ?? []).map(String));

    const getScope = cfg.get?.scope ?? "ALL";
    const getSet = new Set((cfg.get?.eligibleProductIds ?? []).map(String));

    // Eligible buckets
    const buyLines = eligible.filter((l) => (buyScope === "ALL" ? true : buySet.has(getProductId(l))));
    const getLines = eligible.filter((l) => (getScope === "ALL" ? true : getSet.has(getProductId(l))));

    // Total buy quantity among buy-eligible lines
    const totalBuyQty = buyLines.reduce((acc, l) => acc + Math.max(1, l.quantity ?? 1), 0);
    if (totalBuyQty < buyQtyNeeded) return { operations: [] };

    // How many bundles
    let bundles = Math.floor(totalBuyQty / buyQtyNeeded);
    if (!repeats) bundles = Math.min(bundles, 1);
    if (maxRepeats && maxRepeats > 0) bundles = Math.min(bundles, maxRepeats);
    if (bundles <= 0) return { operations: [] };

    // Effect -> value
    let value:
      | { percentage?: { value: number } }
      | { fixedAmount?: { amount: number } }
      | null = null;

    if (cfg.get?.effect?.type === "FREE") {
      value = { percentage: { value: 100 } };
    } else if (cfg.get?.effect?.type === "PERCENT") {
      const pct = normalizePct(cfg.get?.effect?.percent);
      if (pct > 0 && pct <= 100) value = { percentage: { value: pct } };
    } else if (cfg.get?.effect?.type === "AMOUNT") {
      const amt = toNum(cfg.get?.effect?.amount);
      if (amt > 0) value = { fixedAmount: { amount: amt } };
    }
    if (!value) return { operations: [] };

    // Select up to bundles * getQty target lines from get-eligible pool
    const need = bundles * getQty;
    const targetGetLines = getLines.slice(0, Math.max(0, need));
    if (targetGetLines.length === 0) return { operations: [] };

    const prettyMsg =
      cfg.get?.effect?.type === "FREE"
        ? `Code: Buy ${buyQtyNeeded}, get ${getQty} free`
        : cfg.get?.effect?.type === "AMOUNT"
        ? `Code: Buy ${buyQtyNeeded}, get ${toNum((cfg.get?.effect as any)?.amount).toFixed(2)} off`
        : `Code: Buy ${buyQtyNeeded}, get ${normalizePct((cfg.get?.effect as any)?.percent).toFixed(0)}% off`;

    return {
      operations: [
        {
          cartLinesDiscountsAdd: {
            targets: targetGetLines.map((l) => ({ cartLine: { id: l.id } })),
            value,
            message: prettyMsg,
          },
        } as any,
      ],
    };
  }

  // Unknown kind — do nothing
  return { operations: [] };
}
