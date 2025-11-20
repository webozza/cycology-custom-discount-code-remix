import '@shopify/ui-extensions/preact';
import {render} from "preact";
import { useEffect, useState } from 'preact/hooks';


const APP_URL = 'https://qualify-symptoms-instrumental-moved.trycloudflare.com';
//const APP_URL = 'https://cycology-custom-discount-code-remix.vercel.app';

// 1. Export the extension
export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const [giftamount, setGiftamount] = useState(null);

  const formattedGiftAmount = giftamount != null ? shopify.i18n.formatCurrency(Number(giftamount)) : '';
   
  const formattedGiftAmount = giftamount != null ? shopify.i18n.formatCurrency(Number(giftamount)) : '';

  async function fetchGiftCards() {   
    try {
      const token = await shopify.sessionToken.get(); 
      const orderId = await shopify.orderConfirmation.value.order.id;
      const res = await fetch(`${APP_URL}/api/metaobjects/gift-cards`, { 
        headers: { 
          Authorization: `Bearer ${token}`
        },
        method: 'POST',
        body: JSON.stringify({orderId: orderId})  
      });
      const data = await res.json();
      setGiftamount(data.giftAmount);   
    } catch (error) {
      console.log('fetchGiftCards error: ', error)
    }
  } 
 
  useEffect(() => { 
    fetchGiftCards();      
  }, [shopify]);

  if(!giftamount){
    return <s-text></s-text>;
  }
  
  return ( 
    <s-banner tone="success"> 
      {giftamount ?
      <s-stack gap="base"> 
        <s-text>
          Congrats, your order qualifies for a free {formattedGiftAmount} Gift Card!
        </s-text>
      </s-stack>
      : ''}
    </s-banner>
  );
}