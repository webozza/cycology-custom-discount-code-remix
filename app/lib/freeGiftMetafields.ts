
export async function freeGiftMetafields(admin:any){
    const TYPE = "jci_free_gift";
    const DEF_NAME = "JCI Free Gift";

    const GET_DEF = `#graphql
        query GetMetaobjectDef($type: String!) {
            metaobjectDefinitionByType(type: $type) {
                id
                type
                name
                fieldDefinitions { key name }
            }
        }
    `;

    const res = await admin.graphql(GET_DEF, { variables: { type: TYPE } });
    const json = await res.json();

    const exists = !!json?.data?.metaobjectDefinitionByType;


    const neededFields = [
    {
      key: "threshold_amount",
      name: "Threshold Amount",
      type: "number_decimal",
    },
    {
      key: "free_products",
      name: "Free Products",
      type: "list.variant_reference",
    },
    {
      key: "disclaimer_text",
      name: "Disclaimer Text",
      type: "multi_line_text_field",
    },
    {
      key: "away_text",
      name: "Away Text",
      type: "multi_line_text_field",
    },
    {
      key: "complete_text",
      name: "Complete Text",
      type: "multi_line_text_field",
    },
  ];

  if (!exists) {
    const CREATE_DEF = `#graphql
      mutation CreateAppSettingsDef(
        $name:String!,
        $type:String!,
        $fields:[MetaobjectFieldDefinitionCreateInput!]!
      ) {
        metaobjectDefinitionCreate(
          definition: {
            name: $name
            type: $type
            capabilities: { publishable:  { enabled: true }, renderable:  { enabled: true } }
            fieldDefinitions: $fields
          }
        ) {
          metaobjectDefinition { id type name }
          userErrors { field message }
        }
      }
    `;

    const createRes = await admin.graphql(CREATE_DEF, {
      variables: { name: DEF_NAME, type: TYPE, fields: neededFields },
    });
    const createJson = await createRes.json();
    const errs = createJson?.data?.metaobjectDefinitionCreate?.userErrors ?? [];
    if (errs.length) console.warn("[metaobjectDefinitionCreate] errors:", errs);
    return createJson?.data?.metaobjectDefinitionCreate?.metaobjectDefinition ?? null;
    }
}
