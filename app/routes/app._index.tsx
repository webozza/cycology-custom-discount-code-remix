import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {Button} from '@shopify/polaris';
import { Link } from "react-router";

export default function Index() {
  return (
    <s-page>
      <Link to="/app/discount" rel="discount">
        <Button size="large" variant="primary">Discount</Button>
      </Link>
      <Link to="/app/gift-card" rel="discount">
        <Button size="large" variant="primary">Gift Card</Button>
      </Link>
      <Link to="/app/free-gift" rel="free-gift">
        <Button size="large" variant="primary">Frre Gift</Button>
      </Link>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};