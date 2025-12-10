import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

//47778675753192, 47778675818728
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
  const titleDiscount = metafields.discountTitle ?? "FREE GIFT";

  let freeGiftProd:any = null;
  const totalAmount = lines
  .filter(line => {
    const variantId = line.merchandise.id.split('/').pop();
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
    // Sum the amounts for the lines that passed the filter
    return sum + parseFloat(line.cost.subtotalAmount.amount);
  }, 0);

  const operations:any = [];

  console.log('totalAmount', totalAmount)
  console.log('freeGiftProd', freeGiftProd)

  if(thresholdAmount>=totalAmount){
    return {
      operations
    };
  }

  operations.push({
    productDiscountsAdd: {
      candidates: [
        {
          message: 'FREE GIFT',
          targets: [
            {
              cartLine: {
                id: freeGiftProd.id,
              },
            },
          ],
          value: {
            percentage: {
              value: 100,
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
