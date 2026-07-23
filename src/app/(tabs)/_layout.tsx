import AppTabs from '@/components/app-tabs';

/**
 * The authenticated, paired experience. Only reachable once the root layout's pairing guard
 * passes (see src/app/_layout.tsx). The tab bar itself is rebuilt in M2 (Home + Shitlist,
 * Instagram-style); for now it carries the scaffold's Home/Explore tabs.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
