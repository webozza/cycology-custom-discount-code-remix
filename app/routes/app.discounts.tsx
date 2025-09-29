import { useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

/** ---------- GraphQL for Discounts (app-managed) ---------- */
const DISCOUNTS_QUERY = `#graphql
  query AppDiscounts($first: Int!, $after: String, $query: String) {
    discountNodes(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          discount {
            __typename
            # ---- App code discounts
            ... on DiscountCodeApp {
              title
              status
              startsAt
              endsAt
              appDiscountType { appKey }
              codes(first: 3) { edges { node { code } } }
            }
            # ---- App automatic discounts
            ... on DiscountAutomaticApp {
              title
              status
              startsAt
              endsAt
              appDiscountType { appKey }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type DiscountEdge = {
  cursor: string;
  node: {
    id: string;
    discount: {
      __typename: string;
      title?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      status?: string | null;
      codes?: { edges: { node: { code: string } }[] };
    };
  };
};

type LoaderData = {
  discounts: {
    edges: DiscountEdge[];
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  };
};

/** ---------- Loader: auth + fetch discounts ---------- */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(DISCOUNTS_QUERY, {
    variables: { first: 20, query: "type:app" }, // app-managed only
  });
  const json = await response.json();

  const discounts =
    json?.data?.discountNodes ?? { edges: [], pageInfo: { hasNextPage: false } };

  const data: LoaderData = { discounts };
  return data;
};


export const action = async ({ request }: ActionFunctionArgs) => {
  return 1;
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const { discounts } = useLoaderData() as LoaderData;

  /** Helpers for discount rendering */
  const rows = useMemo(() => {
    return (discounts.edges || []).map((edge) => {
      const d = edge.node.discount;
      const type = d.__typename.replace(/^Discount/, ""); // shorter type label
      const title = d.title ?? "—";
      const status = d.status ?? "—";
      const startsAt = d.startsAt ? new Date(d.startsAt).toLocaleString() : "—";
      const endsAt = d.endsAt ? new Date(d.endsAt).toLocaleString() : "—";
      // Prefer first code for code-based discounts
      const firstCode =
        (d as any)?.codes?.edges?.[0]?.node?.code
          ? (d as any).codes.edges[0].node.code
          : null;

      return {
        id: edge.node.id,
        type,
        title,
        code: firstCode,
        status,
        startsAt,
        endsAt,
      };
    });
  }, [discounts.edges]);


  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Discounts">
      <s-button slot="primary-action" href="/app/new">
        Create discount
      </s-button>

      {/* ---------- Discounts List ---------- */}
      <s-section heading="Discounts created/managed by apps">
        <s-paragraph>
          Showing the first 20 app-managed discounts from your store. Code-based
          discounts display their first code for quick reference.
        </s-paragraph>


        <s-button slot="primary-action" onClick={generateProduct}>
          Generate a product
        </s-button>

        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
          style={{ overflowX: "auto" }}
        >
          {rows.length === 0 ? (
            <s-empty-state
              heading="No discounts found"
              action={{ content: "Refresh", url: "/app" }}
            >
              <s-text>Create a discount in Admin, then refresh this page.</s-text>
            </s-empty-state>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Code</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Starts</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Ends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      {r.type}
                    </td>
                    <td style={{ padding: "8px" }}>{r.title}</td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      {r.code ?? "—"}
                    </td>
                    <td style={{ padding: "8px" }}>{r.status}</td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      {r.startsAt}
                    </td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      {r.endsAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </s-box>

        {discounts.pageInfo?.hasNextPage && (
          <s-banner tone="info" title="Pagination">
            <s-paragraph>
              There are more discounts. For pagination, run the same query with{" "}
              <code>after</code> set to{" "}
              <code>{discounts.pageInfo.endCursor}</code> and merge results into
              state.
            </s-paragraph>
          </s-banner>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
