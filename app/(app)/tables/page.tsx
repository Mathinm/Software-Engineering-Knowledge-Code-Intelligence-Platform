"use client";
import { Suspense } from "react";
import { AssetList } from "@/components/asset-pages";

export default function TablesPage() {
  return <Suspense><AssetList kind="table" /></Suspense>;
}
