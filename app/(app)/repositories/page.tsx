"use client";
import { Suspense } from "react";
import { RepositoryList } from "@/components/catalog-pages";

export default function Page() {
  return <Suspense><RepositoryList /></Suspense>;
}
