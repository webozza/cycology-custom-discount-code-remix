import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { runGiftCardCreate } from '../lib/giftCardHelper'

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    console.log(`payload:`, payload);


    //await runGiftCardCreate(shop, session, payload.order_id);

    return new Response();
  } catch (error) {
    console.error("Error processing order-paid webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
