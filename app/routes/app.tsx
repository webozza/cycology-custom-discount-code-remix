import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as PolarisAppProvider, DatePicker, InlineStack } from '@shopify/polaris';  // Polaris AppProvider
import { AppProvider as AppBridgeProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import '@shopify/polaris/build/esm/styles.css';

import { authenticate } from "../shopify.server";
import { freeGiftMetafields } from '../lib/freeGiftMetafields'

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Initialize i18n (basic config, you can expand this later)
const i18n = {
  Polaris: {
    Locale: 'en', // Locale for your app
    Direction: 'ltr',
    Messages: {}, // Add translations here
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let {admin} = await authenticate.admin(request);
  try {
    await freeGiftMetafields(admin);
  } catch (error) {
    console.error("Error occurred while accessing auth route:", error);
  }



  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppBridgeProvider apiKey={apiKey} embedded>
      <NavMenu>
        <Link to="/app/discount" rel="discount">
          Discount
        </Link>
        <Link to="/app/gift-card">Gitf Card</Link>
      </NavMenu>

      <PolarisAppProvider i18n={i18n}>
        <Outlet />
      </PolarisAppProvider>
    </AppBridgeProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
