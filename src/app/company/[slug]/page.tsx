import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import { COMPANIES, DEFAULT_CONFIG, getCompany, getFiling, hunterEnabled, isExistingPartner, PEERS } from "@/lib/data";

export function generateStaticParams() {
  return COMPANIES.map((company) => ({ slug: company.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getCompany(slug)?.name ?? "Company" };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = getCompany(slug);
  if (!company) notFound();

  return (
    <ProfileView
      company={company}
      filing={getFiling(company.foundation.ein)}
      peersTable={PEERS}
      defaultConfig={DEFAULT_CONFIG}
      alreadyPartner={isExistingPartner(company.name)}
      hunterEnabled={hunterEnabled()}
      mode="dataset"
    />
  );
}
