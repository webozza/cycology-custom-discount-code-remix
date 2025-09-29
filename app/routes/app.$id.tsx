// app/routes/app.discounts.$id.tsx
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const LOAD_QUERY = `#graphql
  query ReadDiscount($id: ID!) {
    shop { currencyCode }
    discountNode(id: $id) {
      id
      discount {
        __typename
        ... on DiscountCodeBasic {
          title
          status
          startsAt
          endsAt
          codes(first: 1){ edges{ node{ code } } }
          customerGets {
            value {
              __typename
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
          }
          minimumRequirement {
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal { amount currencyCode }
            }
          }
        }
      }
    }
  }
`;



/** Basic code discount update (FULL ORDER) */
const CODE_BASIC_UPDATE = `#graphql
mutation codeBasicUpdate($id: ID!, $discount: DiscountCodeBasicInput!) {
  discountCodeBasicUpdate(id: $id, basicCodeDiscount: $discount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`;

/** TODO: If the node is an App discount, switch to discountCodeAppUpdate(...) with your function inputs. */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = params.id!;
  const resp = await admin.graphql(LOAD_QUERY, { variables: { id } });
  const json = await resp.json();
  return {
    currencyCode: json?.data?.shop?.currencyCode ?? "USD",
    node: json?.data?.discountNode ?? null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = params.id!;
  const form = await request.formData();

  const method = (form.get("method")?.toString() || "percentage") as "percentage"|"amount";
  const valueStr = form.get("value")?.toString() || "";
  const minSubtotalStr = form.get("minSubtotal")?.toString() || "";
  const code = form.get("code")?.toString() || "";
  const currencyCode = form.get("currencyCode")?.toString() || "USD";

  const valueNum = Number(valueStr);
  if (!code) return { ok:false, error:"Discount code is required." };
  if (!valueStr || Number.isNaN(valueNum) || valueNum <= 0) {
    return { ok:false, error:"Enter a numeric discount value greater than 0." };
  }
  if (method === "percentage" && (valueNum <= 0 || valueNum > 100)) {
    return { ok:false, error:"Percent must be between 1 and 100." };
  }

  const discountValue =
    method === "percentage"
      ? { percentage: { value: valueNum } }
      : { fixedAmount: { amount: valueNum, currencyCode } };

  const minimumRequirement = minSubtotalStr
    ? { subtotal: { greaterThanOrEqualTo: { amount: Number(minSubtotalStr), currencyCode } } }
    : null;

  const variables = {
    id,
    discount: {
      title: code,
      code,
      customerGets: { value: discountValue, items: { all: true } },
      ...(minimumRequirement ? { minimumRequirement } : {}),
    },
  };

  const resp = await admin.graphql(CODE_BASIC_UPDATE, { variables });
  const json = await resp.json();
  const errs = json?.data?.discountCodeBasicUpdate?.userErrors;
  if (errs?.length) return { ok:false, error: errs.map((e:any)=>e.message).join(", ") };
  return { ok:true, id: json?.data?.discountCodeBasicUpdate?.codeDiscountNode?.id };
};

export default function EditDiscount() {
  const { currencyCode, node } = useLoaderData() as any;
  const fetcher = useFetcher<{ ok:boolean; error?:string }>();
  const params = useParams();

  // Prefill from loader
  const d = node?.discount;
  const isPct = d?.customerGets?.value?.__typename === "DiscountPercentage";
  const initialValue = isPct ? d?.customerGets?.value?.value ?? "" : d?.customerGets?.value?.amount ?? "";
  const initialMethod = isPct ? "percentage" : "amount";
  const initialCode = d?.codes?.edges?.[0]?.node?.code ?? "";
  const initialMin = d?.minimumRequirement?.greaterThanOrEqualTo?.amount ?? "";

  const [method, setMethod] = useState<"percentage"|"amount">(initialMethod);
  const [value, setValue] = useState(String(initialValue));
  const [minSubtotal, setMinSubtotal] = useState(String(initialMin));
  const [code, setCode] = useState(initialCode);

  useEffect(()=> {
    if (fetcher.data?.ok) {
      // simple feedback; swap to toast if you prefer
      alert("Discount updated");
    }
  }, [fetcher.data?.ok]);

  const submitting = fetcher.state === "submitting";

  return (
    <s-page heading="Edit discount">
      <s-section>
        {fetcher.data?.error && (
          <s-banner tone="critical" title="Error"><s-text>{fetcher.data.error}</s-text></s-banner>
        )}

        <fetcher.Form method="post">
          <input type="hidden" name="currencyCode" value={currencyCode} />

          <s-stack direction="block" gap="base">
            <s-select
              label="Method"
              name="method"
              value={method}
              onInput={(e:any)=>setMethod(e.target.value)}
              options={[
                { value:"percentage", label:"Percent (%)" },
                { value:"amount", label:`Amount (${currencyCode})` }
              ]}
            />

            <s-inline-stack gap="base">
              <s-text-field
                type="number"
                name="value"
                label={method === "percentage" ? "Percent off (%)" : `Amount off (${currencyCode})`}
                value={value}
                onInput={(e:any)=>setValue(e.target.value)}
              />
              <s-text-field
                type="number"
                name="minSubtotal"
                label={`Minimum order subtotal (${currencyCode}) (optional)`}
                value={minSubtotal}
                onInput={(e:any)=>setMinSubtotal(e.target.value)}
              />
            </s-inline-stack>

            <s-text-field
              name="code"
              label="Discount code"
              value={code}
              onInput={(e:any)=>setCode(e.target.value)}
            />

            <s-inline-stack gap="base">
              <a href="/app/discounts"><s-button variant="tertiary">Back</s-button></a>
              <s-button submit {...(submitting ? { loading:true } : {})}>Save</s-button>
            </s-inline-stack>
          </s-stack>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
