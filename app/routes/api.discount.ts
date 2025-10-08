// app/routes/api.discount.ts
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/** ───────────────── GraphQL ───────────────── */
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

const FUNCTIONS_QUERY = `#graphql
query ListFunctions {
  shopifyFunctions(first: 100) {
    nodes {
      id
      title
      apiType
      app { title }
    }
  }
}`;

/** Admin: expand a Collection -> Product IDs (paginated) */
const COLLECTION_PRODUCTS_QUERY = `#graphql
query CollectionProducts($id: ID!, $cursor: String) {
  collection(id: $id) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage }
      edges {
        cursor
        node { id }
      }
    }
  }
}
`;

/** ──────────────── Utils ──────────────── */
const asDecimal = (n: number) => Number(n).toFixed(2);

async function getFunctionIdByTitle(admin: any, title: string) {
  const resp = await admin.graphql(FUNCTIONS_QUERY);
  const json = await resp.json();
  const list = json?.data?.shopifyFunctions?.nodes ?? [];
  const match = list.find((f: any) => f.apiType === "discount" && f.title === title);
  return match?.id as string | undefined;
}

function arr(form: FormData, key: string): string[] {
  return form.getAll(key).map(String).filter(Boolean);
}

function toNum(s: unknown, def = 0): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : def;
}

/** Expand selected Collection IDs into Product IDs (unique) */
async function expandCollectionsToProductIds(admin: any, collectionIds: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const collId of collectionIds) {
    let cursor: string | null = null;
    // Paginate through all products of the collection
    do {
      const resp = await admin.graphql(COLLECTION_PRODUCTS_QUERY, {
        variables: { id: collId, cursor },
      });
      const json = await resp.json();
      const edges = json?.data?.collection?.products?.edges ?? [];
      for (const e of edges) {
        const pid = e?.node?.id;
        if (pid) out.add(pid);
      }
      const pageInfo = json?.data?.collection?.products?.pageInfo;
      cursor = pageInfo?.hasNextPage ? edges[edges.length - 1]?.cursor ?? null : null;
    } while (cursor);
  }
  return Array.from(out);
}

/** ──────────────── Action ──────────────── */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Accept form-data or JSON
  let data: Record<string, any> = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    data = await request.json();
  } else {
    const form = await request.formData();
    data = Object.fromEntries(form.entries());
    // Read IDs (not names)
    data.productCollectionIds = arr(form, "productCollectionIds[]");
    data.orderCollectionIds   = arr(form, "orderCollectionIds[]");
    data.buyCollectionIds     = arr(form, "buyCollectionIds[]");
    data.getCollectionIds     = arr(form, "getCollectionIds[]");
    data.startDate            = arr(form, "startDate");
    data.endDate              = arr(form, "endDate");
  }

  const discountType = (data.discountType || "product_amount") as
    | "product_amount"
    | "order_amount";

  const code = (data.code || "").trim();
  const currencyCode = (data.currencyCode || "USD").trim();

  if((!data.startDate || data.startDate=='')){
    return Response.json({ ok: false, error: "Start date is required." }, { status: 400 });
  }


  const startDate = (data.startDate || data.startDate!='') ? new Date(data.startDate).toISOString() : new Date().toISOString(); // Default to current date if not provided
  const endDate = (data.endDate && !isNaN(new Date(data.endDate).getTime())) 
    ? new Date(data.endDate).toISOString() 
    : null;

  if (!code) {
    return Response.json({ ok: false, error: "Discount code is required." }, { status: 400 });
  }

  let discountClasses: Array<"ORDER" | "PRODUCT" | "SHIPPING"> = ["ORDER"];
  let functionId: string | undefined;
  let configuration: any = {};
  const combinesWith = {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  };

  if (discountType === "product_amount") {
    // Amount off Product
    const method = (data.method || "percentage") as "percentage" | "amount";
    const valueNum = toNum(data.value);
    const collectionsMode = (data.collectionsMode || "specific") as "all" | "specific";
    const collectionIds: string[] = data.productCollectionIds || [];

    if (!valueNum || valueNum <= 0) {
      return Response.json({ ok: false, error: "Enter a discount value greater than 0." }, { status: 400 });
    }
    if (method === "percentage" && (valueNum <= 0 || valueNum > 100)) {
      return Response.json({ ok: false, error: "Percent must be between 1 and 100." }, { status: 400 });
    }

    functionId =
      (data.functionId as string) ||
      process.env.DISCOUNT_FUNCTION_ID_PRODUCT ||
      (await getFunctionIdByTitle(admin, "JCI-Custom-Discount"));

    if (!functionId) {
      return Response.json({ ok: false, error: "Could not find function JCI-Custom-Discount." }, { status: 400 });
    }

    // If scope is specific, expand to product IDs
    let eligibleProductIds: string[] = [];
    if (collectionsMode === "specific" && collectionIds.length) {
      eligibleProductIds = await expandCollectionsToProductIds(admin, collectionIds);
    }

    configuration = {
      kind: "PRODUCT_AMOUNT",
      value:
        method === "percentage"
          ? { type: "PERCENT", percent: valueNum / 100 }
          : { type: "AMOUNT", amount: asDecimal(valueNum), currencyCode },
      // 🎯 pass product IDs instead of collection IDs
      target: {
        scope: collectionsMode === "all" ? "ALL" : "PRODUCTS",
        eligibleProductIds, // <— consumer: your Function should check product.id ∈ this list
      },
    };

    discountClasses = ["PRODUCT"];
  }

  if (discountType === "order_amount") {
    // Amount off Order
    const method = (data.method || "percentage") as "percentage" | "amount";
    const valueNum = toNum(data.value);
    const minSubtotalNum = toNum(data.minSubtotal);
    const collectionsMode = (data.collectionsMode || "all") as "all" | "specific";
    const collectionIds: string[] = data.orderCollectionIds || [];

    if (!valueNum || valueNum <= 0) {
      return Response.json({ ok: false, error: "Enter a discount value greater than 0." }, { status: 400 });
    }
    if (method === "percentage" && (valueNum <= 0 || valueNum > 100)) {
      return Response.json({ ok: false, error: "Percent must be between 1 and 100." }, { status: 400 });
    }

    functionId =
      (data.functionId as string) ||
      process.env.DISCOUNT_FUNCTION_ID_ORDER ||
      (await getFunctionIdByTitle(admin, "JCI-Custom-Discount"));

    if (!functionId) {
      return Response.json({ ok: false, error: "Could not find function JCI-Custom-Discount." }, { status: 400 });
    }

    // If scope is specific, expand to product IDs
    let eligibleProductIds: string[] | null = null;
    if (collectionsMode === "specific" && collectionIds.length) {
      eligibleProductIds = await expandCollectionsToProductIds(admin, collectionIds);
    }

    configuration = {
      kind: "ORDER_AMOUNT",
      value:
        method === "percentage"
          ? { type: "PERCENT", percent: valueNum / 100 }
          : { type: "AMOUNT", amount: asDecimal(valueNum), currencyCode },
      conditions: {
        minimumSubtotal: minSubtotalNum ? asDecimal(minSubtotalNum) : null,
        // 🎯 pass product IDs instead of collections
        requiresProducts:
          collectionsMode === "specific" ? { eligibleProductIds } : null,
      },
    };

    discountClasses = ["ORDER"];
  }

  // Build GraphQL input
  const variables = {
    codeAppDiscount: {
      title: code,
      code,
      functionId,
      startsAt: startDate || new Date().toISOString(), // Use the start date from the form
      endsAt: endDate || null, // Use the end date from the form
      discountClasses,
      combinesWith,
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

  try {
    const resp = await admin.graphql(CODE_APP_CREATE, { variables });
    const json = await resp.json();

    const errs = json?.data?.discountCodeAppCreate?.userErrors;
    if (errs?.length) {
      const msg = errs
        .map((e: any) => (Array.isArray(e.field) ? `${e.field.join(".")}: ${e.message}` : e.message))
        .join("; ");
      return Response.json({ ok: false, error: msg }, { status: 400 });
    }

    const node = json?.data?.discountCodeAppCreate?.codeAppDiscount;
    return Response.json({
      ok: true,
      id: node?.discountId,
      code: node?.codes?.nodes?.[0]?.code ?? code,
      status: node?.status,
      functionId: node?.appDiscountType?.functionId,
      configuration, // helpful for debugging
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || "Failed to create discount" }, { status: 500 });
  }
};
