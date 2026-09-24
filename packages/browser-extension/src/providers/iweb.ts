import { parsePage, type PageInput } from "../parser";
export const parse = (page: PageInput) => ({
  ...parsePage(page),
  parserProvider: "iweb" as const,
});
