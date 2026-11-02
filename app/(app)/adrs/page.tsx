"use client";
import { Suspense } from "react";
import { AdrListPage } from "@/components/catalog-pages";

export default function Page() {
  return <Suspense><AdrListPage /></Suspense>;
}
