// app/routes/app.discounts.new.tsx
import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { InlineStack } from '@shopify/polaris';

const SHOP_QUERY = `#graphql
  query ShopCurrency { shop { currencyCode } }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const resp = await admin.graphql(SHOP_QUERY);
  const json = await resp.json();
  return { currencyCode: json?.data?.shop?.currencyCode ?? "USD" };
};

export default function NewDiscount() {
  const { currencyCode } = useLoaderData() as { currencyCode: string };
  const fetcher = useFetcher<{ ok: boolean; error?: string; id?: string }>();

  const [method, setMethod] = useState<"percentage" | "amount">("percentage");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  const submitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.ok) {
      // Navigate back to the list after success
      window.location.assign("/app/discounts");
    }
  }, [fetcher.data?.ok]);

  const handleCreate = () => {
    const fd = new FormData();
    
    fd.set("method", method);
    fd.set("value", value);
    fd.set("minSubtotal", minSubtotal);
    fd.set("code", code);
    fd.set("currencyCode", currencyCode);
    //fetcher.submit(fd, { method: "POST", action: "/api/discount" /* <= adjust path if your base is different */ });


    fetch("/api/discount", { method: "POST", body: fd })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) navigate(res.next ?? "/app");
      else alert(res.error || "Failed");
    });
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
          <s-select
            label="Method"
            value={method}
            onChange={(e: any) => {
              const next = (e.target as HTMLSelectElement).value as "percentage" | "amount";
              setMethod(next);
            }}
          >
            <s-option value="percentage">Percent (%)</s-option>
            <s-option value="amount">Amount ({currencyCode})</s-option>
          </s-select>

          <InlineStack gap="400" align="center">
            <s-text-field
              label={method === "percentage" ? "Percent off (%)" : `Amount off (${currencyCode})`}
              value={value}
              onChange={(e: any) => setValue(e.target.value)}
              placeholder={method === "percentage" ? "e.g. 15" : "e.g. 10.00"}
            />
            <s-text-field
              label={`Minimum order subtotal (${currencyCode}) (optional)`}
              value={minSubtotal}
              onChange={(e: any) => setMinSubtotal(e.target.value)}
              placeholder="e.g. 100.00"
            />
          </InlineStack>

          <s-text-field
            label="Discount code"
            value={code}
            onChange={(e: any) => setCode(e.target.value)}
            placeholder="e.g. AUTUMN25"
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
