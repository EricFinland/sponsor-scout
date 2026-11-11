import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import { getAppData, datasetFiling, hunterEnabled, isExistingPartner } from "@/lib/data";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await getAppData()).companies.find((c) => c.slug === slug)?.name ?? "Company" };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAppData();
  const company = data.companies.find((c) => c.slug === slug);
  if (!company) notFound();

  return (
    <ProfileView
      company={company}
      filing={datasetFiling(data, company.foundation.ein)}
      peersTable={data.peers}
      defaultConfig={data.config}
      alreadyPartner={company.relationshipStatus === "current_partner" || isExistingPartner(company.name)}
      hunterEnabled={hunterEnabled()}
      mode="dataset"
    />
  );
}
