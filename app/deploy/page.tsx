import { notFound } from "next/navigation";

import DeployClient from "./deploy-client";

export default function DeployPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEPLOY !== "true") {
    notFound();
  }
  return <DeployClient />;
}
