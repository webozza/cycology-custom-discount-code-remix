// app/routes/app.discounts.new.tsx
import { useEffect, useMemo, useState, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { InlineStack } from "@shopify/polaris";

import '@shopify/polaris/build/esm/styles.css';

// App Bridge (embedded)
import { useAppBridge } from "@shopify/app-bridge-react";

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
type DiscountType = "order_amount"; //"product_amount" | ;
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
  const [discountType, setDiscountType] = useState<DiscountType>("order_amount");
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

  // New state for start and end dates
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const dateInputStyle = {
    paddingInlineStart: "var(--s-input-field-padding-inline-start-25041, 0.75rem)",
    paddingInlineEnd: "var(--s-input-field-padding-inline-end-25041, 0.75rem)",
    fontSize: "var(--s-input-field-font-size-25041, .875rem)",
    lineHeight: "var(--s-input-field-line-height-25041, 1.25rem)",
    minBlockSize: "var(--s-input-field-min-block-size-25041, 2rem)",
    borderRadius: "var(--s-input-field-border-radius-25041, 0.5rem)",
    boxShadow: "inset 0 0 0 var(--s-input-field-box-shadow-width-25041, 0.04125rem) #8a8a8a",
    border: "none"
  }

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

  /** Form submit */
  const handleCreate = () => {
    const fd = new FormData();
    fd.set("currencyCode", currencyCode);
    fd.set("discountType", discountType);
    fd.set("code", code);
    fd.set("startDate", startDate);
    fd.set("endDate", endDate);

    /*
    if (discountType === "product_amount") {
      fd.set("method", prodMethod);
      fd.set("value", prodValue);
      fd.set("collectionsMode", prodCollectionsMode);
      if (prodCollectionsMode === "specific") {
        // Send NAMES – swap to handle/id if you prefer
        for (const c of prodCollections) fd.append("productCollectionIds[]", c.id || "");
      }
    }
      */

    if (discountType === "order_amount") {
      fd.set("method", orderMethod);
      fd.set("value", orderValue);
      fd.set("minSubtotal", orderMinSubtotal);
      fd.set("collectionsMode", orderCollectionsMode);
      if (orderCollectionsMode === "specific") {
        for (const c of orderCollections) fd.append("orderCollectionIds[]", c.id || "");
      }
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
            <s-option value="order_amount">Amount off Order</s-option>
          </s-select>

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

          <InlineStack gap="4">
            {/* Start Date */}
            <div>
              <label htmlFor="startDate">Start Date</label><br/>
              <input style={dateInputStyle} type="date" id="startDate" name="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="endDate">End Date</label><br/>
              <input style={dateInputStyle} type="date" id="endDate" name="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </InlineStack>

          <s-text-field
            label="Discount code"
            value={code}
            onChange={(e: any) => setCode(e.target.value)}
            placeholder={"e.g. SAVE15"}
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
