import type { Metadata } from "next";
import { getChatGPTUser } from "./chatgpt-auth";
import { AnnotatorApp } from "./AnnotatorApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Najah Review Studio",
  description: "A focused, privacy-aware workspace for rating Najah guidance episodes.",
};

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <AnnotatorApp
      initialRater={{
        displayName: user?.displayName ?? "Local preview",
        email: user?.email ?? "local-preview@najah.invalid",
      }}
    />
  );
}
