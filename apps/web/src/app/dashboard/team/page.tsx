import { redirect } from "next/navigation";

// The company portal moved out of the sole-trader dashboard and became
// Milesheet, its own product. Anything still pointing here follows.
export default function TeamRedirect() {
  redirect("/milesheet/portal");
}
