import { atom, useAtomValue, useSetAtom } from 'jotai';
import type { ResourcesRoomEventData } from '@shared/resourcesApiTypes';


export const resourcesDataAtom = atom<ResourcesRoomEventData | null>(null);

export const useSetResourcesData = () => useSetAtom(resourcesDataAtom);
export const useResourcesData = () => useAtomValue(resourcesDataAtom);
