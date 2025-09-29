// app/routes/api.discounts.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const CODE_APP_CREATE = `#graphql
mutation discountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
  discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
    codeAppDiscount {
      discountId
      title
      status
      appDiscountType { functionId }
      codes(first: 1) { nodes { code } }
    }
    userErrors { field message }
  }
}
`;

// Filter to discount functions (optional but nice)
const FUNCTIONS_QUERY = `#graphql
query ListFunctions {
  shopifyFunctions(first: 50) {
    nodes {
      id
      title
      apiType
      app { title }
    }
  }
}`;

async function getDiscountFunctionId(admin: any, name: string) {
  const resp = await admin.graphql(FUNCTIONS_QUERY);
  const json = await resp.json();
  const functions = json?.data?.shopifyFunctions?.nodes || [];
  console.log('getDiscountFunctionId', functions)
  const match = functions.find(
    (f: any) => f.apiType === "discount" && f.title === name
  );

  return match?.id;
}

const asDecimal = (n: number) => Number(n).toFixed(2);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let method: "percentage" | "amount";
  let valueStr: string;
  let minSubtotalStr: string;
  let code: string;
  let currencyCode: string;
  let functionId: string | undefined;

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json();
    method = body.method ?? "percentage";
    valueStr = body.value ?? "";
    minSubtotalStr = body.minSubtotal ?? "";
    code = body.code ?? "";
    currencyCode = body.currencyCode ?? "USD";
    functionId = body.functionId ?? process.env.DISCOUNT_FUNCTION_ID;
  } else {
    const form = await request.formData();
    method = (form.get("method")?.toString() || "percentage") as "percentage" | "amount";
    valueStr = form.get("value")?.toString() || "";
    minSubtotalStr = form.get("minSubtotal")?.toString() || "";
    code = form.get("code")?.toString() || "";
    currencyCode = form.get("currencyCode")?.toString() || "USD";
    functionId = (form.get("functionId")?.toString() || process.env.DISCOUNT_FUNCTION_ID) as string | undefined;
  }

  if (!functionId) {
    functionId = await getDiscountFunctionId(admin, "JCI-Custom-Discount");
  }

  // Validation
  const valueNum = Number(valueStr);
  if (!code) return Response.json({ ok: false, error: "Discount code is required." }, { status: 400 });
  if (!functionId) return Response.json({ ok: false, error: "Could not find discount function JCI-Custom-Discount." }, { status: 400 });
  if (!valueStr || Number.isNaN(valueNum) || valueNum <= 0) {
    return Response.json({ ok: false, error: "Enter a numeric discount value greater than 0." }, { status: 400 });
  }
  if (method === "percentage" && (valueNum <= 0 || valueNum > 100)) {
    return Response.json({ ok: false, error: "Percent must be between 1 and 100." }, { status: 400 });
  }

  const minSubtotalNum = minSubtotalStr ? Number(minSubtotalStr) : 0;

  // Configuration read by your Function (align to your schema)
  const configuration = {
    type: method,
    value: method === "percentage"
      ? { percentage: valueNum / 100 }
      : { amount: asDecimal(valueNum), currencyCode },
    conditions: {
      minimumSubtotal: minSubtotalStr ? asDecimal(minSubtotalNum) : null,
    },
  };

  const variables = {
    codeAppDiscount: {
      title: code,
      code,
      functionId,
      startsAt: new Date().toISOString(),
      // 🔴 REQUIRED for Functions using the "discounts" API type
      // Choose the classes your function actually affects:
      // "ORDER" (subtotal), "PRODUCT" (cart lines), "SHIPPING" (delivery rates)
      discountClasses: ["ORDER"],

      // Stacking rules with native discounts
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },

      // Pass config for your function
      metafields: [
        {
          namespace: "default",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify(configuration),
        },
      ],
    },
  };

  const resp = await admin.graphql(CODE_APP_CREATE, { variables });
  const json = await resp.json();

  const errs = json?.data?.discountCodeAppCreate?.userErrors;
  if (errs?.length) {
    return Response.json(
      { ok: false, error: errs.map((e: any) => (Array.isArray(e.field) ? `${e.field.join(".")}: ${e.message}` : e.message)).join("; ") },
      { status: 400 },
    );
  }

  const node = json?.data?.discountCodeAppCreate?.codeAppDiscount;
  return Response.json({
    ok: true,
    id: node?.discountId,
    code: node?.codes?.nodes?.[0]?.code ?? code,
    status: node?.status,
    functionId: node?.appDiscountType?.functionId,
  });
};
