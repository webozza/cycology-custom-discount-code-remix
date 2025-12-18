import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    throw new Error('No cart lines found');
  }

  const lines = input.cart.lines;
  const metafields = input.discount.metafield?.jsonValue;
  const productIds = metafields.product_ids ? metafields.product_ids.split(",") : [];
  const thresholdAmount = parseFloat(metafields.threshold_amount ?? "0");
  const titleDiscount = metafields.title ?? "FREE GIFT";

  const operations:any = [];

  if(productIds.length==0){
    return {
      operations
    };
  }

  let freeGiftProd:any = null;
  const totalAmount = lines
  .filter(line => {
    const variantId = line.merchandise.product.id.split('/').pop();
    if(freeGiftProd){
      return true;
    }
    if(!productIds.includes(variantId)){
      return true;
    }else{
      freeGiftProd = line;
      return false;
    }
  })
  .reduce((sum, line) => {
    return sum + parseFloat(line.cost.subtotalAmount.amount);
  }, 0);

  if(thresholdAmount>=totalAmount){
    return {
      operations
    };
  }

  operations.push({
    productDiscountsAdd: {
      candidates: [
        {
          message: titleDiscount,
          targets: [
            {
              cartLine: {
                id: freeGiftProd.id,
              },
            },
          ],
          value: {
            fixedAmount: {
              amount: freeGiftProd.cost.amountPerQuantity.amount,
            },
          },
        }
      ],
      selectionStrategy: ProductDiscountSelectionStrategy.First,
    },
  });

  return {
    operations,
  };
}
