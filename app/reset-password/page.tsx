import type { Metadata } from "next";

import { ResetPasswordScreen } from "./ResetPasswordScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password | Najah Review Studio",
  description: "Choose a new password for a Najah Review Studio account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const token = typeof parameters.token === "string" ? parameters.token : "";
  return <ResetPasswordScreen token={token} />;
}
