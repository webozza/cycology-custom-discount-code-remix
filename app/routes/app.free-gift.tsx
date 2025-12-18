import { useState, useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { InlineStack } from "@shopify/polaris";
import '@shopify/polaris/build/esm/styles.css';
import { useAppBridge } from "@shopify/app-bridge-react";

/** ─────────────────────────────────────────────────────────────────────
 * Loader: fetch shop currency for labels
 * ────────────────────────────────────────────────────────────────────*/
const SHOP_QUERY = `#graphql
  query ShopCurrency { shop { id currencyCode } }
`;

const DISCOUNTFUNC_QUERY = `#graphql
  query($first: Int!, $query: String!) {
    automaticDiscountNodes(first: $first, query: $query) {
      edges {
        node {
          id
          metafield(namespace: "custom", key: "free_gift_json"){
            id
            jsonValue
          }
          automaticDiscount {
            ... on DiscountAutomaticApp {
              discountId
              title
              status
              discountClasses
              combinesWith{
                productDiscounts
                orderDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const shop = await admin.graphql(SHOP_QUERY);
    const discount = await admin.graphql(DISCOUNTFUNC_QUERY, {
      variables: {
        query: "type:app title:\"JCI Free Gift\"",
        first: 1
      }
    });
    const shopJson = await shop.json();
    const discountJson = await discount.json();
    
    let productJson;
    if(discountJson?.data?.automaticDiscountNodes?.edges && discountJson?.data?.automaticDiscountNodes?.edges[0]?.node){
      let jsonValue = discountJson?.data?.automaticDiscountNodes?.edges[0]?.node?.metafield?.jsonValue;
      const PRODUCTQUERY = `#graphql
        query getProductsByIds($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
            }
          }
        }
      `;
      if(jsonValue && jsonValue.product_ids){
        const productIds = jsonValue.product_ids.split(",").map((v:string) => {
          return `gid://shopify/Product/${v}`;
        })
        if(productIds){
          const product = await admin.graphql(PRODUCTQUERY, {
            variables: {
              ids: productIds
            }
          });
          productJson = await product.json();
        }
      }
    }

    return { shop: shopJson?.data?.shop, discount: discountJson?.data?.automaticDiscountNodes?.edges ? discountJson?.data?.automaticDiscountNodes?.edges[0]?.node : {}, product: productJson ? productJson.data.nodes : [] };
  } catch (error) {
    console.error("Loader error:", error);
    return { shop: null, discount: null, product: [] };
  }
};



export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const form = await request.formData();

    const shopId = form.get("shopId") as string || null;
    const discountId = form.get("discountId") as string || null;
    const metafieldId = form.get("metafieldId") as string || null;
    const title = form.get("title") as string || null;
    const thresholdAmount = form.get("thresholdAmount") as string || null;
    const selectedProductIds = form.get("selectedProductIds") as string || null;
    const selectedProductHandles = form.get("selectedProductHandles") as string || null;

    const mutation = `#graphql
      mutation discountAutomaticAppUpdate($automaticAppDiscount: DiscountAutomaticAppInput!, $id: ID!) {
        discountAutomaticAppUpdate(automaticAppDiscount: $automaticAppDiscount, id: $id) {
          automaticAppDiscount {
            discountId
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const variables = {
        id: discountId,
        automaticAppDiscount: {
          metafields: [
            {
              id: metafieldId,
              value: JSON.stringify({
                title: title,
                threshold_amount: thresholdAmount,
                product_ids: selectedProductIds,
                product_handles: selectedProductHandles,
              }),
            },
          ],
        }
      };

      const resp = await admin.graphql(mutation, {
        variables
      });
      const data = await resp.json();

      const metaMutation = `#graphql
      mutation SetShopFreeGiftMetafield(
          $ownerId: ID!
          $value: String!
      ) {
          metafieldsSet(metafields: [
          {
              ownerId: $ownerId
              namespace: "custom"
              key: "jci_free_gift"
              type: "json"
              value: $value
          }
          ]) {
          metafields {
              id
              namespace
              key
              value
              type
          }
          userErrors {
              field
              message
              code
          }
          }
      }`;

      const metaValue = {
        title: title,
        threshold_amount: thresholdAmount,
        product_ids: selectedProductIds,
        product_handles: selectedProductHandles,
      }

      const metaVariables = {
        ownerId: shopId,
        value: JSON.stringify(metaValue)
      };

    const metaResp = await admin.graphql(metaMutation, {
      variables: metaVariables,
    });
    const metaData = await metaResp.json();
    return {data, metaData};
  } catch (error) {
    console.error("Action error:", error);
    return { error: "An error occurred while processing your request." };
  }
}

/** ─────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────*/
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
  const { shop, discount, product } = useLoaderData() as { shop: any, discount: any, product: any };
  const fetcher = useFetcher<typeof action>();
  const app = useAppBridge();

  const submitting = fetcher.state === "submitting";

  // Global
  const [discountId, setDiscountId] = useState("");
  const [metafieldId, setMetafieldId] = useState("");
  const [title, setTitle] = useState("");
  const [thresholdAmount, setThresholdAmount] = useState("");
  const [prodProducts, setProdProducts] = useState<PickedProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState("");
  const [selectedProductHandles, setSelectedProductHandles] = useState("");

  useEffect(() => {
    if(discount?.metafield?.jsonValue){
      let jsonValue = discount?.metafield?.jsonValue;
      setMetafieldId(discount?.metafield?.id);
      setDiscountId(discount.automaticDiscount.discountId);
      setTitle(jsonValue.title);
      setThresholdAmount(jsonValue.threshold_amount);
      setSelectedProductIds(jsonValue.product_ids);
    }
  }, [discount]);


  useEffect(() => {
    setProdProducts(product);
  }, [product]);

  useEffect(() => {
    let prodSelected = prodProducts ? prodProducts.map(v => v.id.split("/").pop()).join(",") : "";
    let prodSelectedHandles = prodProducts ? prodProducts.map((v:any) => v.handle).join(",") : "";
    setSelectedProductIds(prodSelected);
    setSelectedProductHandles(prodSelectedHandles);
  }, [prodProducts]);

  /** Form submit */
  const handleCreate = () => {
    const fd = new FormData();
    fd.set("shopId", shop.id);
    fd.set("discountId", discountId);
    fd.set("metafieldId", metafieldId);
    fd.set("title", title);
    fd.set("method", "amount");
    fd.set("thresholdAmount", thresholdAmount);
    fd.set("thresholdAmount", thresholdAmount);
    fd.set("selectedProductIds", selectedProductIds);
    fetcher.submit(fd, { method: "POST" });
  };

  async function pickProdProducts() {
    const picked = await openProductPicker(app, prodProducts.map((p) => p.id));
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
              <s-text>No products selected</s-text>
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
            label={`Threshold Amount (${shop.currencyCode})`}
            value={thresholdAmount}
            onChange={(e: any) => setThresholdAmount(e.target.value)}
            placeholder="e.g. 20.00"
          />

          <InlineStack gap="400" align="center">
            <a href="/app/discounts">
              <s-button variant="tertiary">Cancel</s-button>
            </a>
            <s-button onClick={handleCreate} {...(submitting ? { loading: true } : {})}>
              Save
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
