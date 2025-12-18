import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { registerMetafields } from '../lib/registerMetafields'
import { freeGiftMetafields } from '../lib/freeGiftMetafields'

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop, admin } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);
    
    await registerMetafields(admin);
    await freeGiftMetafields(admin);

    const current = payload.current as string[];
    if (session) {
        await db.session.update({   
            where: {
                id: session.id
            },
            data: {
                scope: current.toString(),
            },
        });
    }
    return new Response();
};
