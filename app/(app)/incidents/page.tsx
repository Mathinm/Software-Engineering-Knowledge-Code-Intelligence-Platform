import { redirect } from "next/navigation";

export default function IncidentsIndex() {
  redirect("/issues?tab=incidents");
}
