import { providerFor } from "../../../../src/lib/import/parser";
import * as generic from "./generic";
import * as snar from "./snar";
import * as iweb from "./iweb";
import * as hrmos from "./hrmos";
import * as recruiting from "./recruiting-platform";
import type { PageInput } from "../parser";
export function extractPage(page: PageInput) {
  const provider = providerFor(page.url);
  return {
    snar,
    iweb,
    hrmos,
    "recruiting-platform": recruiting,
    generic,
    mail: generic,
    gemini: generic,
  }[provider].parse(page);
}
