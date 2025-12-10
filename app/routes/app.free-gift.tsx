// app/routes/app.discounts.new.tsx
import { useState } from "react";
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
type Method = "amount";
type PickedProduct = { id: string; title?: string; handle?: string };

/** ─────────────────────────────────────────────────────────────────────
 * App Bridge: open product picker (multiple)
 * ────────────────────────────────────────────────────────────────────*/
async function openProductPicker(
  app: any,
  initialIds: string[] = []
): Promise<PickedProduct[]> {
  return new Promise(async (resolve) => {
    let productSelected = await shopify.resourcePicker({type: 'product', multiple: true, action: "select", selectionIds: initialIds.map((id) => ({ id }))});
    const out = (productSelected ?? []).map((n: any) => ({
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
  const [title, setTitle] = useState("");
  const [prodValue, setProdValue] = useState("");
  const [prodProducts, setProdProducts] = useState<PickedProduct[]>([]);

  /** Form submit */
  const handleCreate = () => {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("method", "amount");
    fd.set("value", prodValue);

    // Send selected products if any
    if (prodProducts.length) {
      for (const p of prodProducts) fd.append("productIds[]", p.id || "");
    }

    fetch("/api/discount", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) navigate(res.next ?? "/app/discounts");
        else alert(res.error || "Failed");
      })
      .catch((e) => alert(String(e)));
  };

  async function pickProdProducts() {
    const picked = await openProductPicker(app, prodProducts.map((p) => p.id));
    console.log('picked', picked);
    if (picked.length) setProdProducts(picked);
  }

  return (
    <s-page>
      <s-section>
        {fetcher.data?.error && (
          <s-banner tone="critical">
            <s-text>{fetcher.data.error}</s-text>
          </s-banner>
        )}

        <s-stack direction="block" gap="base">
          {/* Title */}
          <s-text-field
            label="Discount Title"
            value={title}
            onChange={(e: any) => setTitle(e.target.value)}
            placeholder="e.g. Summer Sale"
          />

          {/* Product Select */}
          <InlineStack gap="400" align="center">
            <s-button onClick={pickProdProducts}>Choose Products</s-button>
          </InlineStack>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {prodProducts.length === 0 ? (
              <s-text variation="subdued">No products selected</s-text>
            ) : (
              prodProducts.map((p) => (
                <Chip
                  key={p.id}
                  text={p.title || p.id}
                  sub={p.handle ? `@${p.handle}` : undefined}
                  onRemove={() => setProdProducts(prodProducts.filter((prod) => prod.id !== p.id))}
                />
              ))
            )}
          </div>

          {/* Amount */}
          <s-text-field
            label={`Amount off (${currencyCode})`}
            value={prodValue}
            onChange={(e: any) => setProdValue(e.target.value)}
            placeholder="e.g. 20.00"
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
 * Chip renderer
 * ────────────────────────────────────────────────────────────────────*/
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
