import type { Metadata } from "next";
import { getRaterIdentity } from "@/lib/server-auth";
import { AuthScreen } from "./AuthScreen";
import { AnnotatorApp } from "./AnnotatorApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Najah Review Studio",
  description: "A focused, privacy-aware workspace for rating Najah guidance episodes.",
};

export default async function Home() {
  const rater = await getRaterIdentity();
  if (!rater) return <AuthScreen />;
  return <AnnotatorApp initialRater={rater} />;
}
