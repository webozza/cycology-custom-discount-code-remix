// app/lib/openCollectionsPicker.ts
import {ResourcePicker} from '@shopify/app-bridge/actions';

export type PickedCollection = { id: string; title?: string; handle?: string };

export async function openCollectionsPicker(app: any, initialIds: string[] = []): Promise<PickedCollection[]> {
  return new Promise((resolve, reject) => {
    const picker = ResourcePicker.create(app, {
      resourceType: ResourcePicker.ResourceType.Collection,
      multiple: true,
      initialSelectionIds: initialIds.map((id) => ({id})),
      // Optional filters:
      // query: 'title:*summer*',
      // showHidden: false,
    });

    const unsubscribeSelect = picker.subscribe(ResourcePicker.Action.SELECT, (payload) => {
      unsubscribe();
      resolve(
        (payload?.selection ?? []).map((n: any) => ({
          id: n?.id,
          title: n?.title,
          handle: n?.handle,
        }))
      );
    });

    const unsubscribeCancel = picker.subscribe(ResourcePicker.Action.CANCEL, () => {
      unsubscribe();
      resolve([]);
    });

    const unsubscribe = () => {
      unsubscribeSelect();
      unsubscribeCancel();
    };

    picker.dispatch(ResourcePicker.Action.OPEN);
  });
}
