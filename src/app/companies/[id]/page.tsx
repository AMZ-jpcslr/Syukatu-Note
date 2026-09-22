import { CompanyDetail } from "@/components/company-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; tab?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <CompanyDetail
      key={id}
      id={id}
      initialEdit={query.edit === "1"}
      initialTab={query.tab === "ES" ? "ES" : "概要"}
    />
  );
}
