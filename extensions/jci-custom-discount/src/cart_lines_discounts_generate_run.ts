import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

// Helpers
const toNum = (v: any) => Number.parseFloat(String(v ?? "0"));

type Config = {
  type?: "percentage" | "amount";
  value?: {
    percentage?: number;
    amount?: string | number;
    currencyCode?: string; 
  };
  conditions?: { minimumSubtotal?: string | number | null };
};

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  const lines = input.cart?.lines ?? [];

  const cfg = (input.discount?.metafield?.jsonValue as Config) ?? {};
  const minSubtotal = toNum(cfg.conditions?.minimumSubtotal ?? 0);

  const hasOrderClass = (input.discount?.discountClasses ?? []).includes(DiscountClass.Order);
  const cartSubtotal = toNum(input.cart?.cost?.subtotalAmount?.amount);
  if (!hasOrderClass || cartSubtotal < minSubtotal) return { operations: [] };

  const isExcluded = (l: any) =>
    Boolean(l?.merchandise?.product?.metafield?.value) || Boolean(l?.attribute?.value);
  const excludedLineIds = lines.filter(isExcluded).map((l: any) => l.id);
  const eligibleCount = lines.length - excludedLineIds.length;
  if (eligibleCount <= 0) return { operations: [] };

  let candidateValue:
    | { percentage: { value: number } }
    | { fixedAmount: { amount: number } }
    | null = null;

  if (cfg.type === "amount") {
    const amt = toNum(cfg.value?.amount);
    if (amt > 0) candidateValue = { fixedAmount: { amount: amt } };
  } else {
    const raw = Number(cfg.value?.percentage ?? 0);
    const pct = raw <= 1 ? raw * 100 : raw;
    if (pct > 0 && pct <= 100) candidateValue = { percentage: { value: pct } };
  }

  if (!candidateValue) return { operations: [] };

  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: OrderDiscountSelectionStrategy.First,
          candidates: [
            {
              message:
                cfg.type === "amount"
                  ? `Code: ${toNum(cfg.value?.amount).toFixed(2)} off (excluding already-discounted items)`
                  : `Code: ${((Number(cfg.value?.percentage ?? 0) <= 1)
                      ? Number(cfg.value?.percentage ?? 0) * 100
                      : Number(cfg.value?.percentage ?? 0)
                    ).toFixed(0)}% off (excluding already-discounted items)`,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: excludedLineIds,
                  },
                },
              ],
              value: candidateValue,
            },
          ],
        },
      },
    ],
  };
}
