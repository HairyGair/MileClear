import { redirect } from "next/navigation";

// /teams was the interest probe that preceded the product. It is Milesheet now.
export default function TeamsRedirect() {
  redirect("/milesheet");
}
