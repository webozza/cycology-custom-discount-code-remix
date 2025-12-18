
export async function freeGiftMetafields(admin:any){
    const TYPE = "jci_free_gift";
    const DEF_NAME = "JCI Free Gift";

    const SHOP_QUERY = `#graphql
        query shopDetails {
        shop {
          id
        }
      }
    `;

    const shopRes = await admin.graphql(SHOP_QUERY);
    const shopResJson = await shopRes.json();


    if(shopResJson?.data?.shop == null){
        console.warn("Unable to fetch shop details for free gift metafields.");
        return null;
    }

    const shopId = shopResJson.data.shop.id;

    if(!shopId){
        console.warn("Shop ID is null or undefined for free gift metafields.");
        return null;
    }else{
        console.log("Shop ID :", shopId);
    }

    const SHOPMETA_QUERY = `#graphql
      mutation createShopJsonMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    const shopMeta_Variaables = {
      metafields: [
        {
          ownerId: shopId,
          namespace: "jci_free_gift",
          key: "app",
          type: "json",
          value: "{}",
        },
      ],
    };

    const shopMetaReq = await admin.graphql(SHOPMETA_QUERY, {
      variables: shopMeta_Variaables,
    });
    const shopMetaJson = await shopMetaReq.json();

    if (
      shopMetaJson?.data?.metafieldsSet?.userErrors &&
      shopMetaJson.data.metafieldsSet.userErrors.length > 0
    ) {
      console.warn(
        "Errors creating shop metafield for free gift:",
        shopMetaJson.data.metafieldsSet.userErrors,
      );
    }else{
        console.log("Shop metafield for free gift ensured:", JSON.stringify(shopMetaJson.data));
    }




  const DISCOUNTFUNC_QUERY = `#graphql
    query($first: Int!, $query: String!) {
      automaticDiscountNodes(first: $first, query: $query) {
        edges {
          node {
            id
            metafield(namespace: "app", key: "free_gift_json"){
              id
              jsonValue
            }
            automaticDiscount {
              ... on DiscountAutomaticApp {
                discountId
                title
                status
                discountClasses
                combinesWith{
                  productDiscounts
                  orderDiscounts
                  shippingDiscounts
                }
              }
            }
          }
        }
      }
    }
  `;

    const discount = await admin.graphql(DISCOUNTFUNC_QUERY, {
      variables: {
        query: "type:app title:\"JCI Free Gift\"",
        first: 1
      }
    });
    const discountJson = await discount.json();

    if(discountJson?.data?.automaticDiscountNodes?.edges && discountJson?.data?.automaticDiscountNodes?.edges[0]?.node){

    }else{
        const DISCOUNT_FUNCTION = `#graphql
        query ListFunctions {
          shopifyFunctions(first: 50) {
            nodes {
              id
              title
              apiType
              app { title }
            }
          }
        }
        `;

        const discountFunctionRes = await admin.graphql(DISCOUNT_FUNCTION);
        const discountFunctionJson = await discountFunctionRes.json();
        const functions = discountFunctionJson?.data?.shopifyFunctions?.nodes || [];
        const freeGiftFunction = functions.find((fn: any) => fn.title === "JCI Free Gift");

        if(!freeGiftFunction){
            console.warn("Free Gift Discount Function not found among Shopify Functions.");
            return;
        }

        const functionId = freeGiftFunction.id;


        const CREATE_DISCOUNT_QUERY = `#graphql
        mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
            userErrors {
              field
              message
            }
            automaticAppDiscount {
              discountId
              title
              startsAt
              endsAt
              status
              appDiscountType {
                appKey
                functionId
              }
            }
          }
        }`;

        const createDiscount_Variables = {
          automaticAppDiscount: {
            title: "JCI Free Gift",
            functionId: functionId,
            startsAt: new Date().toISOString(),
              discountClasses: ["PRODUCT"],
              combinesWith: {
                productDiscounts: true,
                orderDiscounts: true,
                shippingDiscounts: true
              },
              metafields: [
                {
                type: "json",
                namespace: "app",
                key: "free_gift_json",
                value: "{}"
                }
              ]
          }
        };

        const createDiscountReq = await admin.graphql(CREATE_DISCOUNT_QUERY, {
          variables: createDiscount_Variables,
        });
        const createDiscountJson = await createDiscountReq.json();
        console.warn("Created Free Gift Discount:", createDiscountJson);
    }
}
