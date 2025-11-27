import { shopifyAdminGraphQL } from "./shopifyHelper";

export function toOrderGid(id: string) {
  if (id.startsWith("gid://")) {
    return id.replace("OrderIdentity", "Order");
  }
  return `gid://shopify/Order/${id}`;
}

type GiftTierEntry = {
  id: string;
  min_amount?: number | null;
  max_amount?: number | null;
  gift_amount?: number | null;
};


export async function runGiftCardCreate(shop: string, session: any, orderId: string) {
    const orderDetails = await shopifyAdminGraphQL<{
        order: {
            id: string;
            name: string;
            totalPriceSet: { shopMoney: { amount: string; currencyCode: string }; presentmentMoney: { amount: string; currencyCode: string } };
            customer: {
                id: string;
                displayName: string;
                email: string;
            };
        };
    }>(
        shop,
        session?.accessToken ?? "",
        `query GetOrderDetails($id: ID!) {
          order(id: $id) {
              id
              name
              totalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
              customer {
                  id
                  displayName
                  email
              }
          }
        }`,
        {
            id: toOrderGid(orderId),
        }
    );

    const conditionDetails = await shopifyAdminGraphQL<{
        metaobjects: {
            edges: Array<{
                cursor: string;
                node: {
                    id: string;
                    handle: string;
                    type: string;
                    displayName: string;
                    updatedAt: string;
                    capabilities: {
                        publishable: { status: string };
                    };
                    fields: Array<{
                        key: string;
                        value: string;
                    }>;
                };
            }>;
            pageInfo: { hasNextPage: boolean; endCursor: string };
        };
    }>(
        shop,
        session?.accessToken ?? "",
        `query GetMetaobjectEntries($type: String!, $first: Int!, $after: String) {
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
        }`,
        {
          type: 'jci_gift_card',
          first: 50
        }
    );

        // --- Extract and filter entries
    const entries: GiftTierEntry[] = conditionDetails.metaobjects.edges.filter((e: any) => e.node.capabilities.publishable.status === 'ACTIVE').map((e: any) => {
        const obj: Record<string, any> = {};
        e.node.fields.forEach((f: any) => (obj[f.key] = f.value));
        return { id: e.node.id, ...obj };
    });

    // --- Your order total from above
    const orderAmount = Number(orderDetails.order?.totalPriceSet?.presentmentMoney?.amount ?? 0);

    // --- Find matching metaobject entry
    const match = entries.find((e: any) => {
        const min = Number(e.min_amount ?? 0);
        const max = Number(e.max_amount ?? 0);
        return orderAmount >= min && orderAmount <= max;
    });

    let giftAmount = match ? Number(match.gift_amount ?? 0) : 0;


    if(giftAmount>0){

      const giftCardInput = {
          initialValue: giftAmount,
          customerId: orderDetails.order.customer.id,
          note: `Auto-generated gift card for order ${orderDetails.order.name}`,
          expiresOn: null, 
      };
      
      const CreateGiftCard = await shopifyAdminGraphQL<{
        giftCardCreate: {
            giftCard: {
                id: string;
                maskedCode: string;
                initialValue: {
                    amount: number;
                    currencyCode: string;
                };
                expiresOn: string | null;
                customer: {
                    email: string;
                };
                recipientAttributes: {
                    recipient: {
                        id: string;
                    };
                    message: string;
                    preferredName: string;
                    sendNotificationAt: string;
                } | null;
            } | null;
            userErrors: Array<{
                field: Array<string> | null;
                message: string;
            }>;
        };
      }>(
          shop,
          session?.accessToken ?? "",
          `mutation CreateGiftCard($input: GiftCardCreateInput!) {
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
          }`,
          {
            input: giftCardInput
          }
      );
    }

    
}