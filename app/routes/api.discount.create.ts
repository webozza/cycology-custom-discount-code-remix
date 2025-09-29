// app/routes/api.discounts.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const CODE_BASIC_CREATE = `#graphql
mutation codeBasicCreate($discount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $discount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`;

const asDecimal = (n: number) => Number(n).toFixed(2);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let method: "percentage" | "amount";
  let valueStr: string;
  let minSubtotalStr: string;
  let code: string;
  let currencyCode: string;

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json();
    method = body.method ?? "percentage";
    valueStr = body.value ?? "";
    minSubtotalStr = body.minSubtotal ?? "";
    code = body.code ?? "";
    currencyCode = body.currencyCode ?? "USD";
  } else {
    const form = await request.formData();
    method = (form.get("method")?.toString() || "percentage") as "percentage" | "amount";
    valueStr = form.get("value")?.toString() || "";
    minSubtotalStr = form.get("minSubtotal")?.toString() || "";
    code = form.get("code")?.toString() || "";
    currencyCode = form.get("currencyCode")?.toString() || "USD";
  }

  const valueNum = Number(valueStr);
  if (!code) return Response.json({ ok: false, error: "Discount code is required." }, { status: 400 });
  if (!valueStr || Number.isNaN(valueNum) || valueNum <= 0) {
    return Response.json({ ok: false, error: "Enter a numeric discount value greater than 0." }, { status: 400 });
  }
  if (method === "percentage" && (valueNum <= 0 || valueNum > 100)) {
    return Response.json({ ok: false, error: "Percent must be between 1 and 100." }, { status: 400 });
  }

  const minSubtotalNum = Number(minSubtotalStr);

  // Build values for your Admin API version:
  // - percentage: ratio 0..1
  // - amount: Decimal string
  const customerGetsValue =
    method === "percentage"
      ? { percentage: valueNum / 100 }
      : { amount: asDecimal(valueNum) };

  // greaterThanOrEqualToSubtotal is a Decimal string (no currency object)
  const minimumRequirement =
    minSubtotalStr
      ? { subtotal: { greaterThanOrEqualToSubtotal: asDecimal(minSubtotalNum) } }
      : null;

  const variables = {
    discount: {
      title: code,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: {
        value: customerGetsValue,
        items: { all: true }, // full order
      },
      ...(minimumRequirement ? { minimumRequirement } : {}),
    },
  };

  const resp = await admin.graphql(CODE_BASIC_CREATE, { variables });
  const json = await resp.json();

  const errs = json?.data?.discountCodeBasicCreate?.userErrors;
  if (errs?.length) {
    return Response.json(
      { ok: false, error: errs.map((e: any) => (Array.isArray(e.field) ? `${e.field.join(".")}: ${e.message}` : e.message)).join("; ") },
      { status: 400 },
    );
  }

  const id = json?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
  return Response.json({ ok: true, id });
};
