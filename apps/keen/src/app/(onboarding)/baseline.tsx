import { router } from 'expo-router';

import { BaselineTest } from '@/baseline/BaselineTest';

/** The 60-second baseline test, then the plan. */
export default function BaselineRoute() {
  return <BaselineTest onDone={() => router.replace('/plan')} />;
}
