import { parsePage, type PageInput } from "../parser";
export const parse = (page: PageInput) => ({
  ...parsePage(page),
  parserProvider: "recruiting-platform" as const,
});
