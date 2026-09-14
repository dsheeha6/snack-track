import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

// Nothing to subscribe to: the answer flips exactly once, when React hands the
// static HTML over to the client, and that transition is the subscription.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // The static render and the hydration pass that has to match it both read
  // the server snapshot; React swaps in the client snapshot immediately after.
  // Asking useSyncExternalStore rather than setting a flag in an effect keeps
  // the "have we hydrated yet" answer out of the render/effect/re-render loop.
  const hasHydrated = useSyncExternalStore(subscribe, onClient, onServer);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
