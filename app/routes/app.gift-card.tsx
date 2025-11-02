import { useMemo } from "react";
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function Index() {
  return (
    <s-page>
      <s-section heading="Discounts created/managed by apps">
        <s-paragraph>
          Showing per page. Code-based discounts display their first code for quick reference.
        </s-paragraph>

      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};