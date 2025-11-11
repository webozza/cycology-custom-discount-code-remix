
export async function registerMetafields(admin:any){
    const TYPE = "jci_gift_card";
    const DEF_NAME = "JCI Gift Card";

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
      key: "min_amount",
      name: "Min Amount",
      type: "number_decimal",
    },
    {
      key: "max_amount",
      name: "Max Amount",
      type: "number_decimal",
    },
    {
      key: "gift_amount",
      name: "Gift Amount",
      type: "number_decimal",
      validations: [
        { name: "min", value: "0" },
        { name: "max", value: "5000" },
      ],
    }
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
