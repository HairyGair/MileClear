import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth/context";

export default function Index() {
  const { isAuthenticated } = useAuth();
  return <Redirect href={isAuthenticated ? "/(tabs)/dashboard" : "/(auth)/login"} />;
}
