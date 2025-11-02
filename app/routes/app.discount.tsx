import { useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

/** ---------- GraphQL for Discounts (app-managed) ---------- */
const DISCOUNTS_QUERY = `
  query AppDiscounts($first: Int, $last: Int, $after: String, $before: String, $query: String) {
    discountNodes(first: $first, last: $last, after: $after, before: $before, query: $query) {
      edges {
        cursor
        node {
          id
          discount {
            __typename
            ... on DiscountCodeApp {
              title
              status
              startsAt
              endsAt
              appDiscountType { appKey }
              codes(first: 3) { edges { node { code } } }
            }
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
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
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
  pageSize: number;
  discounts: {
    edges: DiscountEdge[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: string | null;
      endCursor?: string | null;
    };
  };
};

/** ---------- Loader: auth + fetch discounts w/ cursor pagination ---------- */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const pageSize = 20; // page size

  const variables: Record<string, any> = {
    query: "type:app",
    first: before ? undefined : pageSize,
    last: before ? pageSize : undefined,
    after: before ? undefined : after,
    before: before ?? undefined,
  };

  const response = await admin.graphql(DISCOUNTS_QUERY, { variables });
  const json = await response.json();

  const discounts =
    json?.data?.discountNodes ?? {
      edges: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    };

  const data: LoaderData = { pageSize, discounts };
  return data;
};

export default function Index() {
  const { discounts, pageSize } = useLoaderData() as LoaderData;

  /** Helpers for discount rendering */
  const rows = useMemo(() => {
    return (discounts.edges || []).map((edge) => {
      const d = edge.node.discount;
      const type = d.__typename.replace(/^Discount/, ""); // shorter type label
      const title = d.title ?? "—";
      const status = d.status ?? "—";
      const startsAt = d.startsAt ? new Date(d.startsAt).toLocaleString() : "—";
      const endsAt = d.endsAt ? new Date(d.endsAt).toLocaleString() : "—";
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

  const { hasNextPage, hasPreviousPage, startCursor, endCursor } = discounts.pageInfo || {};

  // Build querystring helpers
  const qs = (params: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) u.set(k, v);
    });
    return `?${u.toString()}`;
  };

  return (
    <s-page>
      <s-button slot="primary-action" href="/app/new">
        Create discount
      </s-button>

      {/* ---------- Discounts List ---------- */}
      <s-section heading="Discounts created/managed by apps">
        <s-paragraph>
          Showing {pageSize} per page. Code-based discounts display their first code for quick reference.
        </s-paragraph>

        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px" }}>
              <h3>No discounts found</h3>
              <p>Create a discount in Admin, then refresh this page.</p>
              <a href="/app">
                <button type="button">Refresh</button>
              </a>
            </div>
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

        <div className="flex items-center gap-2 mt-4">
          <s-button
            variant="secondary"
            disabled={!hasPreviousPage || !startCursor}
            href={hasPreviousPage && startCursor ? qs({ before: startCursor }) : undefined}
          >
            ← Prev
          </s-button>

          <s-button
            variant="secondary"
            disabled={!hasNextPage || !endCursor}
            href={hasNextPage && endCursor ? qs({ after: endCursor }) : undefined}
          >
            Next →
          </s-button>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};