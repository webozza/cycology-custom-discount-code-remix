// /app/routes/api.metaobjects.gift-cards.ts
import { authenticate } from "../shopify.server";
import { corsJson, makeCorsHeaders } from '../lib/cors.server'
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import jwt from "jsonwebtoken";
import { getOfflineSessionByShop, shopifyAdminGraphQL } from '../lib/shopifyHelper'

const toCustomerGid = (id: string) => id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;

const API_KEY = process.env.SHOPIFY_API_KEY!;
const API_SECRET = process.env.SHOPIFY_API_SECRET!;

type ShopifyJWT = {
  iss: string;
  dest: string;          // e.g. "https://your-shop.myshopify.com"
  aud: string;           // should match API_KEY
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti?: string;
  sid?: string;
};


function toOrderGid(id: string) {
  if (id.startsWith("gid://")) {
    return id.replace("OrderIdentity", "Order");
  }
  return `gid://shopify/Order/${id}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
    const origin = request.headers.get("Origin") ?? undefined;
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: makeCorsHeaders(origin),
        });
    }
    return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
    const origin = request.headers.get("Origin") ?? undefined;

    if (request.method === "OPTIONS") {
        return corsJson(null, 200, origin);
    }
    const body = await request.json().catch(() => ({} as any));
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let orderId = body.orderId ?? body.orderId ?? null;
  // 2) Verify token with your API secret and constrain audience + algorithm
    let claims: ShopifyJWT;
    try {
        claims = jwt.verify(token, API_SECRET, {
        algorithms: ["HS256"],
        audience: API_KEY, 
        }) as ShopifyJWT;
    } catch (err: any) {
        return corsJson({ error: "Invalid/expired token", details: err?.message }, 401, origin);
    }

    const shopDomain:string = claims.dest;

    const offlineSession = await getOfflineSessionByShop(shopDomain ?? "");

    const ORDER_QUERY = `#graphql
        query GetOrderDetails($id: ID!) {
        order(id: $id) {
            id
            name
            totalPriceSet { shopMoney { amount currencyCode } }
            customer {
                id
                displayName
                email
            }
        }
        }
    `;

    const orderDetails = await shopifyAdminGraphQL<any>(
        shopDomain,
        offlineSession?.accessToken ?? "",
        ORDER_QUERY,
        {
            id: toOrderGid(orderId),
        }
    );

    console.log('orderId', orderId)
    console.log('orderDetails', orderDetails.order)

    const GET_METAOBJECT_ENTRIES = `#graphql
        query GetMetaobjectEntries($type: String!, $first: Int!, $after: String) {
            metaobjects(type: $type, first: $first, after: $after) {
            edges {
                cursor
                node {
                id
                handle
                type
                displayName
                updatedAt
                capabilities {
                    publishable { status }
                }
                fields {
                    key
                    value
                }
                }
            }
            pageInfo { hasNextPage endCursor }
            }
        }
    `;

    const graphResult = await shopifyAdminGraphQL<any>(
        shopDomain,
        offlineSession?.accessToken ?? "",
        GET_METAOBJECT_ENTRIES,
        {
            type: 'jci_gift_card',
            first: 50
        }
    );

    // --- Extract and filter entries
    const entries = graphResult.metaobjects.edges.filter((e: any) => e.node.capabilities.publishable.status === 'ACTIVE').map((e: any) => {
        const obj: Record<string, any> = {};
        e.node.fields.forEach((f: any) => (obj[f.key] = f.value));
        return { id: e.node.id, ...obj };
    });

    // --- Your order total from above
    const orderAmount = Number(orderDetails.order?.totalPriceSet?.shopMoney?.amount ?? 0);

    // --- Find matching metaobject entry
    const match = entries.find((e: any) => {
        const min = Number(e.min_amount ?? 0);
        const max = Number(e.max_amount ?? 0);
        return orderAmount >= min && orderAmount <= max;
    });

    let giftAmount = match ? Number(match.gift_amount ?? 0) : 0;

    // --- Log for debug
    console.log("Order amount:", orderAmount);
    console.log("Matched metaobject:", match);
    console.log("Gift amount:", giftAmount);

    if(giftAmount>0){
        const GIFT_CARD_MUTATION = `#graphql
            mutation CreateGiftCard($input: GiftCardCreateInput!) {
            giftCardCreate(input: $input) {
                giftCard {
                    id
                    maskedCode
                    initialValue {
                        amount
                        currencyCode
                    }
                    expiresOn
                    customer {
                        email
                    }
                    recipientAttributes {
                        recipient {
                            id
                        }
                        message
                        preferredName
                        sendNotificationAt
                    }
                }
                userErrors {
                field
                message
                }
            }
            }
        `;
        
        const giftCardInput = {
            initialValue: giftAmount,
            customerId: orderDetails.order.customer.id,
            note: `Auto-generated gift card for order ${orderDetails.order.name}`,
            expiresOn: null, 
        };

        const giftCardResult = await shopifyAdminGraphQL<any>(
            shopDomain,
            offlineSession?.accessToken ?? "",
            GIFT_CARD_MUTATION,
            { input: giftCardInput }
        );

        console.log('giftCardResult', giftCardResult.giftCardCreate);

    }

    return corsJson({orderAmount, match, giftAmount}, 200, origin);

}
