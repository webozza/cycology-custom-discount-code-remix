
import prisma from '../db.server'

export async function getOfflineSessionByShop(shop: string) {
  const session = await prisma.session.findFirst({
    where: {
      shop,
      isOnline: false, // offline token = permanent Admin access
    },
  });
  return session;
}

export async function shopifyAdminGraphQL<T>(
  shop: string,
  adminToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': adminToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Admin GraphQL ${res.status}`);
  const json = await res.json();
  if (json?.errors) throw new Error(JSON.stringify(json.errors));
  if (json?.data?.userErrors?.length) throw new Error(JSON.stringify(json.data.userErrors));
  return json.data as T;
}
