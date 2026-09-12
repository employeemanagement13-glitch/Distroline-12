import { getBlockedShops } from "@/lib/actions/shops";
import { BlockedClient } from "./BlockedClient";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function BlockedPage() {
  const blockedShops = await getBlockedShops();

  return (
    <div className="p-6">
      <PageHeader
        title="Blocked Accounts"
        subtitle="Tab 2, Page 2 — Manage blocked retailer accounts and unblock them"
      />
      <BlockedClient blockedShops={blockedShops} />
    </div>
  );
}

