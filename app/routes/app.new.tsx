// app/routes/app.discounts.new.tsx
import { useEffect, useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { InlineStack } from "@shopify/polaris";

// App Bridge (embedded)
import { useAppBridge } from "@shopify/app-bridge-react";
import { ResourcePicker } from "@shopify/app-bridge/actions";

/** ─────────────────────────────────────────────────────────────────────
 * Loader: fetch shop currency for labels
 * ────────────────────────────────────────────────────────────────────*/
const SHOP_QUERY = `#graphql
  query ShopCurrency { shop { currencyCode } }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const resp = await admin.graphql(SHOP_QUERY);
  const json = await resp.json();
  return { currencyCode: json?.data?.shop?.currencyCode ?? "USD" };
};

/** ─────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────*/
type DiscountType = "product_amount" | "order_amount" | "bxgy";
type Method = "percentage" | "amount";
type CollectionsMode = "all" | "specific";
type GetBenefitType = "free" | "percent" | "amount";

type PickedCollection = { id: string; title?: string; handle?: string };

/** ─────────────────────────────────────────────────────────────────────
 * App Bridge: open collection picker (multiple)
 * ────────────────────────────────────────────────────────────────────*/
async function openCollectionsPicker(
  app: any,
  initialIds: string[] = []
): Promise<PickedCollection[]> {
  return new Promise(async (resolve) => {
    let collectionSelected = await shopify.resourcePicker({type: 'collection', multiple: true, selectionIds: initialIds.map((id) => ({ id }))});
    const out = (collectionSelected ?? []).map((n: any) => ({
      id: n?.id,
      title: n?.title,
      handle: n?.handle,
    }));
    resolve(out);
  });
}

/** ─────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────*/
export default function NewDiscount() {
  const { currencyCode } = useLoaderData() as { currencyCode: string };
  const fetcher = useFetcher<{ ok: boolean; error?: string; next?: string }>();
  const navigate = useNavigate();
  const app = useAppBridge();

  const submitting = fetcher.state === "submitting";

  // Global
  const [discountType, setDiscountType] = useState<DiscountType>("product_amount");
  const [code, setCode] = useState("");

  // Amount off Product
  const [prodMethod, setProdMethod] = useState<Method>("percentage");
  const [prodValue, setProdValue] = useState("");
  const [prodCollectionsMode, setProdCollectionsMode] = useState<CollectionsMode>("specific");
  const [prodCollections, setProdCollections] = useState<PickedCollection[]>([]);

  // Amount off Order
  const [orderMethod, setOrderMethod] = useState<Method>("percentage");
  const [orderValue, setOrderValue] = useState("");
  const [orderMinSubtotal, setOrderMinSubtotal] = useState("");
  const [orderCollectionsMode, setOrderCollectionsMode] = useState<CollectionsMode>("specific");
  const [orderCollections, setOrderCollections] = useState<PickedCollection[]>([]);

  // Buy X Get Y
  const [buyQty, setBuyQty] = useState("1");
  const [buyCollectionsMode, setBuyCollectionsMode] = useState<CollectionsMode>("specific");
  const [buyCollections, setBuyCollections] = useState<PickedCollection[]>([]);

  const [getQty, setGetQty] = useState("1");
  const [getBenefitType, setGetBenefitType] = useState<GetBenefitType>("free");
  const [getBenefitValue, setGetBenefitValue] = useState(""); // % or amount when not "free"
  const [getCollectionsMode, setGetCollectionsMode] = useState<CollectionsMode>("specific");
  const [getCollections, setGetCollections] = useState<PickedCollection[]>([]);

  const [repeats, setRepeats] = useState(true);
  const [maxRepeatsPerOrder, setMaxRepeatsPerOrder] = useState("");

  useEffect(() => {
    if (fetcher.data?.ok) {
      window.location.assign(fetcher.data.next ?? "/app/discounts");
    }
  }, [fetcher.data?.ok]);

  async function pickProdCollections() {
    const picked = await openCollectionsPicker(app, prodCollections.map((c) => c.id));
    console.log('picked', picked);
    if (picked.length) setProdCollections(picked);
  }
  async function pickOrderCollections() {
    const picked = await openCollectionsPicker(app, orderCollections.map((c) => c.id));
    console.log('picked', picked);
    if (picked.length) setOrderCollections(picked);
  }
  async function pickBxCollections(side: "buy" | "get") {
    const current = side === "buy" ? buyCollections : getCollections;
    const picked = await openCollectionsPicker(app, current.map((c) => c.id));
    console.log('picked', picked);
    if (!picked.length) return;
    side === "buy" ? setBuyCollections(picked) : setGetCollections(picked);
  }

  /** Form submit */
  const handleCreate = () => {
    const fd = new FormData();
    fd.set("currencyCode", currencyCode);
    fd.set("discountType", discountType);
    fd.set("code", code);

    if (discountType === "product_amount") {
      fd.set("method", prodMethod);
      fd.set("value", prodValue);
      fd.set("collectionsMode", prodCollectionsMode);
      if (prodCollectionsMode === "specific") {
        // Send NAMES – swap to handle/id if you prefer
        for (const c of prodCollections) fd.append("productCollectionIds[]", c.id || "");
      }
    }

    if (discountType === "order_amount") {
      fd.set("method", orderMethod);
      fd.set("value", orderValue);
      fd.set("minSubtotal", orderMinSubtotal);
      fd.set("collectionsMode", orderCollectionsMode);
      if (orderCollectionsMode === "specific") {
        for (const c of orderCollections) fd.append("orderCollectionIds[]", c.id || "");
      }
    }

    if (discountType === "bxgy") {
      fd.set("buyQty", buyQty);
      fd.set("buyCollectionsMode", buyCollectionsMode);
      if (buyCollectionsMode === "specific") {
        for (const c of buyCollections) fd.append("buyCollectionIds[]", c.id || "");
      }

      fd.set("getQty", getQty);
      fd.set("getBenefitType", getBenefitType);
      if (getBenefitType !== "free" && getBenefitValue) {
        fd.set("getBenefitValue", getBenefitValue);
      }
      fd.set("getCollectionsMode", getCollectionsMode);
      if (getCollectionsMode === "specific") {
        for (const c of getCollections) fd.append("getCollectionIds[]", c.id || "");
      }

      fd.set("repeats", String(repeats));
      if (repeats && maxRepeatsPerOrder) fd.set("maxRepeatsPerOrder", maxRepeatsPerOrder);
    }

    // You used fetch() in your original — keep it consistent
    fetch("/api/discount", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) navigate(res.next ?? "/app/discounts");
        else alert(res.error || "Failed");
      })
      .catch((e) => alert(String(e)));
  };

  return (
    <s-page>
      <s-section>
        {fetcher.data?.error && (
          <s-banner tone="critical">
            <s-text>{fetcher.data.error}</s-text>
          </s-banner>
        )}

        <s-stack direction="block" gap="base">
          {/* Discount Type */}
          <s-select
            label="Discount type"
            value={discountType}
            onChange={(e: any) =>
              setDiscountType((e.target as HTMLSelectElement).value as DiscountType)
            }
          >
            <s-option value="product_amount">Amount off Product</s-option>
            <s-option value="order_amount">Amount off Order</s-option>
            <s-option value="bxgy">Buy X Get Y</s-option>
          </s-select>

          {/* Amount off Product */}
          {discountType === "product_amount" && (
            <>
              <s-select
                label="Method"
                value={prodMethod}
                onChange={(e: any) =>
                  setProdMethod((e.target as HTMLSelectElement).value as Method)
                }
              >
                <s-option value="percentage">Percent (%)</s-option>
                <s-option value="amount">Amount ({currencyCode})</s-option>
              </s-select>

              <s-text-field
                label={prodMethod === "percentage" ? "Percent off (%)" : `Amount off (${currencyCode})`}
                value={prodValue}
                onChange={(e: any) => setProdValue(e.target.value)}
                placeholder={prodMethod === "percentage" ? "e.g. 15" : "e.g. 10.00"}
              />

              <InlineStack gap="400" align="center">
                <s-select
                  label="Collections scope"
                  value={prodCollectionsMode}
                  onChange={(e: any) =>
                    setProdCollectionsMode((e.target as HTMLSelectElement).value as CollectionsMode)
                  }
                >
                  <s-option value="all">All collections</s-option>
                  <s-option value="specific">Specific collections</s-option>
                </s-select>

                {prodCollectionsMode === "specific" && (
                  <div style={{ width: "100%" }}>
                    <s-text>Select product collections</s-text>
                    <InlineStack gap="200" align="center">
                      <s-button onClick={pickProdCollections}>Choose collections</s-button>
                    </InlineStack>
                    <ChipsGrid
                      items={prodCollections}
                      onRemove={(id) =>
                        setProdCollections(prodCollections.filter((c) => c.id !== id))
                      }
                    />
                  </div>
                )}
              </InlineStack>
            </>
          )}

          {/* Amount off Order */}
          {discountType === "order_amount" && (
            <>
              <s-select
                label="Method"
                value={orderMethod}
                onChange={(e: any) =>
                  setOrderMethod((e.target as HTMLSelectElement).value as Method)
                }
              >
                <s-option value="percentage">Percent (%)</s-option>
                <s-option value="amount">Amount ({currencyCode})</s-option>
              </s-select>

              <InlineStack gap="400" align="center">
                <s-text-field
                  label={orderMethod === "percentage" ? "Percent off (%)" : `Amount off (${currencyCode})`}
                  value={orderValue}
                  onChange={(e: any) => setOrderValue(e.target.value)}
                  placeholder={orderMethod === "percentage" ? "e.g. 10" : "e.g. 20.00"}
                />
                <s-text-field
                  label={`Minimum order subtotal (${currencyCode}) (optional)`}
                  value={orderMinSubtotal}
                  onChange={(e: any) => setOrderMinSubtotal(e.target.value)}
                  placeholder="e.g. 100.00"
                />
              </InlineStack>

              <InlineStack gap="400" align="center">
                <s-select
                  label="Collections condition"
                  value={orderCollectionsMode}
                  onChange={(e: any) =>
                    setOrderCollectionsMode((e.target as HTMLSelectElement).value as CollectionsMode)
                  }
                >
                  <s-option value="all">Any items</s-option>
                  <s-option value="specific">Must include items from collections</s-option>
                </s-select>

                {orderCollectionsMode === "specific" && (
                  <div style={{ width: "100%" }}>
                    <s-text>Select qualifying collections</s-text>
                    <InlineStack gap="200" align="center">
                      <s-button onClick={pickOrderCollections}>Choose collections</s-button>
                    </InlineStack>
                    <ChipsGrid
                      items={orderCollections}
                      onRemove={(id) =>
                        setOrderCollections(orderCollections.filter((c) => c.id !== id))
                      }
                    />
                  </div>
                )}
              </InlineStack>
            </>
          )}

          {/* Buy X Get Y */}
          {discountType === "bxgy" && (
            <>
              <s-subsection>
                <s-text as="h3" variant="headingMd">Buy (qualifier)</s-text>
                <InlineStack gap="400" align="center">
                  <s-text-field
                    label="Minimum quantity to buy"
                    value={buyQty}
                    onChange={(e: any) => setBuyQty(e.target.value)}
                    type="number"
                    min="1"
                  />
                  <s-select
                    label="Buy applies to"
                    value={buyCollectionsMode}
                    onChange={(e: any) =>
                      setBuyCollectionsMode((e.target as HTMLSelectElement).value as CollectionsMode)
                    }
                  >
                    <s-option value="all">Any products</s-option>
                    <s-option value="specific">Specific collections</s-option>
                  </s-select>
                </InlineStack>

                {buyCollectionsMode === "specific" && (
                  <div style={{ width: "100%" }}>
                    <s-text>Select buy collections</s-text>
                    <InlineStack gap="200" align="center">
                      <s-button onClick={() => pickBxCollections("buy")}>Choose collections</s-button>
                    </InlineStack>
                    <ChipsGrid
                      items={buyCollections}
                      onRemove={(id) =>
                        setBuyCollections(buyCollections.filter((c) => c.id !== id))
                      }
                    />
                  </div>
                )}
              </s-subsection>

              <s-subsection>
                <s-text as="h3" variant="headingMd">Get (benefit)</s-text>
                <InlineStack gap="400" align="center">
                  <s-text-field
                    label="Quantity customer gets"
                    value={getQty}
                    onChange={(e: any) => setGetQty(e.target.value)}
                    type="number"
                    min="1"
                  />
                  <s-select
                    label="Benefit type"
                    value={getBenefitType}
                    onChange={(e: any) =>
                      setGetBenefitType((e.target as HTMLSelectElement).value as GetBenefitType)
                    }
                  >
                    <s-option value="free">Free</s-option>
                    <s-option value="percent">Percent off (%)</s-option>
                    <s-option value="amount">Amount off ({currencyCode})</s-option>
                  </s-select>
                </InlineStack>

                {getBenefitType === "percent" && (
                  <s-text-field
                    label="Percent off (%)"
                    value={getBenefitValue}
                    onChange={(e: any) => setGetBenefitValue(e.target.value)}
                    placeholder="e.g. 100 for free, 50 for half off"
                  />
                )}
                {getBenefitType === "amount" && (
                  <s-text-field
                    label={`Amount off (${currencyCode})`}
                    value={getBenefitValue}
                    onChange={(e: any) => setGetBenefitValue(e.target.value)}
                    placeholder="e.g. 10.00"
                  />
                )}

                <InlineStack gap="400" align="center">
                  <s-select
                    label="Get applies to"
                    value={getCollectionsMode}
                    onChange={(e: any) =>
                      setGetCollectionsMode((e.target as HTMLSelectElement).value as CollectionsMode)
                    }
                  >
                    <s-option value="all">Any products</s-option>
                    <s-option value="specific">Specific collections</s-option>
                  </s-select>
                </InlineStack>

                {getCollectionsMode === "specific" && (
                  <div style={{ width: "100%" }}>
                    <s-text>Select get collections</s-text>
                    <InlineStack gap="200" align="center">
                      <s-button onClick={() => pickBxCollections("get")}>Choose collections</s-button>
                    </InlineStack>
                    <ChipsGrid
                      items={getCollections}
                      onRemove={(id) =>
                        setGetCollections(getCollections.filter((c) => c.id !== id))
                      }
                    />
                  </div>
                )}
              </s-subsection>

              <s-subsection>
                <s-text as="h3" variant="headingMd">Per-order application</s-text>
                <InlineStack gap="400" align="center">
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={repeats}
                      onChange={(e) => setRepeats(e.target.checked)}
                    />
                    <s-text>Repeat for every multiple</s-text>
                  </label>
                  {repeats && (
                    <s-text-field
                      label="Max repeats per order (optional)"
                      value={maxRepeatsPerOrder}
                      onChange={(e: any) => setMaxRepeatsPerOrder(e.target.value)}
                      type="number"
                      min="1"
                    />
                  )}
                </InlineStack>
              </s-subsection>
            </>
          )}

          {/* Common: code + actions */}
          <s-text-field
            label="Discount code"
            value={code}
            onChange={(e: any) => setCode(e.target.value)}
            placeholder={discountType === "bxgy" ? "e.g. BUY2GET1" : "e.g. SAVE15"}
          />

          <InlineStack gap="400" align="center">
            <a href="/app/discounts">
              <s-button variant="tertiary">Cancel</s-button>
            </a>
            <s-button onClick={handleCreate} {...(submitting ? { loading: true } : {})}>
              Create
            </s-button>
          </InlineStack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);

/** ─────────────────────────────────────────────────────────────────────
 * Small Chips renderer
 * ────────────────────────────────────────────────────────────────────*/
function ChipsGrid({
  items,
  onRemove,
}: {
  items: PickedCollection[];
  onRemove: (id: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [items]
  );
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {sorted.length === 0 ? (
        <s-text variation="subdued">No collections selected</s-text>
      ) : (
        sorted.map((c) => (
          <Chip
            key={c.id}
            text={c.title || c.id}
            sub={c.handle ? `@${c.handle}` : undefined}
            onRemove={() => onRemove(c.id)}
          />
        ))
      )}
    </div>
  );
}

function Chip({
  text,
  sub,
  onRemove,
}: {
  text: string;
  sub?: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: "#fafafa",
        fontSize: 12,
      }}
    >
      <span>{text}</span>
      {sub ? <code style={{ opacity: 0.6 }}>{sub}</code> : null}
      <button
        aria-label={`Remove ${text}`}
        onClick={onRemove}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}
