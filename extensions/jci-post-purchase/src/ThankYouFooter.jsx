import '@shopify/ui-extensions/preact';
import {render} from "preact";
import { useEffect, useState } from 'preact/hooks';


// 1. Export the extension
export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const [giftamount, setGiftamount] = useState(null);
   
  async function fetchGiftCards() {   
    try {
      const token = await shopify.sessionToken.get(); 
      const orderId = await shopify.orderConfirmation.value.order.id;
      const shopUrl = await shopify.shop.storefrontUrl;
      console.log(`${shopUrl}/app/jci-app/metaobjects/gift-cards`)
      const res = await fetch(`${shopUrl}/app/jci-app/metaobjects/gift-cards`, {
        headers: { 
          Authorization: `Bearer ${token}`, 
          'Access-Control-Allow-Origin': '*',   
          mode: "no-cors" 
        },
        method: 'POST',
        body: JSON.stringify({orderId: orderId})  
      });
      const data = await res.json();    
      setGiftamount(data.giftAmount);   
    } catch (error) {
      console.error('fetchGiftCards error: ', error)
    }
  } 

  useEffect(() => { 
    fetchGiftCards();      
  }, [shopify]);

  if(!giftamount){
    return <div>a</div>; 
  }
  
  return ( 
    <s-banner tone="success"> 
      {giftamount ?
      <s-stack gap="base"> 
        <s-text>
          Congrats, your order qualifies for a free ${giftamount} Gift Card!
        </s-text>
      </s-stack>
      : ''}
    </s-banner>
  );
}