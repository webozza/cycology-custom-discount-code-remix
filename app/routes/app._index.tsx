import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {Button, InlineStack, Card, Box, Icon, Text } from '@shopify/polaris';
import { Link } from "react-router";
import { DiscountFilledIcon, GiftCardFilledIcon, GiftCardIcon } from "@shopify/polaris-icons";


export default function Index() {
  return (
    <s-page>
      <InlineStack gap="400" wrap>
        <div style={{ minWidth: 260 }}>
          <NavCard
            to="/app/discount"
            icon={DiscountFilledIcon}
            title="Discount"
            subtitle="Manage discount settings"
          />
        </div>

        <div style={{ minWidth: 260 }}>
          <NavCard
            to="/app/gift-card"
            icon={GiftCardFilledIcon}
            title="Gift Card"
            subtitle="Configure gift card rules"
          />
        </div>

        <div style={{ minWidth: 260 }}>
          <NavCard
            to="/app/free-gift"
            icon={GiftCardIcon}
            title="Free Gift"
            subtitle="Set free gift threshold"
          />
        </div>
      </InlineStack>
    </s-page>
  );
}


function NavCard({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <Link to={to} style={{ textDecoration: "none", color: "inherit" }}>
      <Card>
        <Box padding="400">
          <InlineStack gap="400" align="center" blockAlign="center">
            <span style={{ transform: "scale(2)", display: "inline-flex" }}>
              <Icon source={icon} tone="base" />
            </span>
            <Box>
              <Text as="h3" variant="headingMd">
                {title}
              </Text>
              {subtitle ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  {subtitle}
                </Text>
              ) : null}
            </Box>
          </InlineStack>
        </Box>
      </Card>
    </Link>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};