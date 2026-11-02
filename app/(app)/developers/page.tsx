"use client";
import { Suspense } from "react";
import { DeveloperList } from "@/components/catalog-pages";

export default function Page() {
  return <Suspense><DeveloperList /></Suspense>;
}
