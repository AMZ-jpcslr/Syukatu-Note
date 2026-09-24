import { parsePage, type PageInput } from "../parser";
export const parse = (page: PageInput) => ({
  ...parsePage(page),
  parserProvider: "hrmos" as const,
});
