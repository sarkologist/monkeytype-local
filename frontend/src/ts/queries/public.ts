import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";
import {
  getContributorsList,
  getReleasesFromGitHub,
  getSupportersList,
} from "../utils/json-data";
import { baseKey } from "./utils/keys";
import { format as dateFormat } from "date-fns/format";

const queryKeys = {
  root: () => baseKey("public"),
  contributors: () => [...queryKeys.root(), "contributors"],
  supporters: () => [...queryKeys.root(), "supporters"],
  versionHistory: () => [...queryKeys.root(), "versionHistory"],
};

//cache results for one hour
const staleTime = 1000 * 60 * 60;

// oxlint-disable-next-line typescript/explicit-function-return-type
export const getContributorsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.contributors(),
    queryFn: getContributorsList,
    staleTime,
  });

// oxlint-disable-next-line typescript/explicit-function-return-type
export const getSupportersQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.supporters(),
    queryFn: getSupportersList,
    staleTime,
  });

// oxlint-disable-next-line typescript/explicit-function-return-type
export const getVersionHistoryQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.versionHistory(),
    queryFn: fetchVersionHistory,
    staleTime,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 1,
  });

async function fetchVersionHistory(options: { pageParam: number }): Promise<{
  nextCursor: number | undefined;
  releases: { name: string; publishedAt: string; bodyHTML: string }[];
}> {
  const releases = await getReleasesFromGitHub({ page: options.pageParam });
  const data = [];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;

    let body = release.body;

    body = body.replace(/\r\n/g, "<br>");
    //replace ### title with h3 title h3
    body = body.replace(
      /### (.*?)<br>/g,
      '<h3 class="text-sub mb-2 text-xl">$1</h3>',
    );
    body = body.replace(/<\/h3><br>/gi, "</h3>");
    //remove - at the start of a line
    body = body.replace(/^- /gm, "");
    //replace **bold** with bold
    body = body.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    //replace links with a tags
    body = body.replace(
      /\[(.*?)\]\((.*?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

    data.push({
      name: release.name,
      publishedAt: dateFormat(new Date(release.published_at), "dd MMM yyyy"),
      bodyHTML: body,
    });
  }
  return {
    nextCursor: data.length > 0 ? options.pageParam + 1 : undefined,
    releases: data,
  };
}
