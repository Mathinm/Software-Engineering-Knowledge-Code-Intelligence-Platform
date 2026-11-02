"use client";
import { Suspense } from "react";
import { AssetList } from "@/components/asset-pages";

export default function ApisPage() {
  return <Suspense><AssetList kind="api" /></Suspense>;
}
