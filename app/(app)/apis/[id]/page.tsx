"use client";
import { Suspense, use } from "react";
import { AssetDetail } from "@/components/asset-pages";

export default function ApisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><AssetDetail kind="api" id={id} /></Suspense>;
}
