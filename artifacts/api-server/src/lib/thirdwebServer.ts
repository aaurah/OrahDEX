import { createThirdwebClient } from "thirdweb";

if (!process.env.THIRDWEB_SECRET_KEY) {
  console.warn("[ThirdWeb] THIRDWEB_SECRET_KEY is not set — server-side ThirdWeb features will be unavailable.");
}

export const thirdwebServerClient = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY ?? "",
});
