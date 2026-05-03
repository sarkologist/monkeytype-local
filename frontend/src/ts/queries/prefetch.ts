import { queryClient } from ".";
import {
  getContributorsQueryOptions,
  getSupportersQueryOptions,
} from "./public";

export function prefetchAboutPage(): void {
  void queryClient.prefetchQuery(getContributorsQueryOptions());
  void queryClient.prefetchQuery(getSupportersQueryOptions());
}
