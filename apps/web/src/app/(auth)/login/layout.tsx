import { Plus_Jakarta_Sans } from "next/font/google";
import "./signin.css";

// The sign-in page uses the app's font, like the dashboard it leads to.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--mc-font",
});

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <div className={jakarta.variable}>{children}</div>;
}
