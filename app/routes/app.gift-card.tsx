import { useMemo } from "react";
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from 'react';

export default function Index() {
  const shopify = useAppBridge();
  const [shop, setShop] = useState<string>("");
  const [metaentryurl, setMetaentryurl] = useState<string>("");

  useEffect(() => {
    setShop(shopify.config.shop ?? "");
    console.log(shopify)
    const storeDomain = shopify?.config?.shop?.replace(".myshopify.com", "");
    setMetaentryurl(`https://admin.shopify.com/store/${storeDomain}/content/metaobjects/entries/jci_gift_card`);
  }, [shopify]);

  return (
    <s-page>
      <s-button slot="primary-action" href={metaentryurl}>
        Edit Condition
      </s-button>

      <s-section heading="Gift card created/managed by apps">
        <s-paragraph>
          
        </s-paragraph>


      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};