function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

export const isBiometricSupported = (): boolean =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

export async function registerBiometric(): Promise<
  { success: true; credentialId: string } | { success: false; error: string }
> {
  if (!isBiometricSupported()) {
    return { success: false, error: "Your browser does not support biometric authentication." };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "OrahDEX",
          id: window.location.hostname === "localhost" ? "localhost" : window.location.hostname,
        },
        user: {
          id: userId,
          name: "orahdex-user",
          displayName: "OrahDEX User",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { success: false, error: "No credential returned." };

    const credentialId = b64encode(credential.rawId);
    return { success: true, credentialId };
  } catch (err: any) {
    if (err?.name === "NotAllowedError") {
      return { success: false, error: "Permission denied. Please allow biometric access." };
    }
    if (err?.name === "NotSupportedError") {
      return { success: false, error: "Your device does not have a biometric sensor." };
    }
    if (err?.name === "InvalidStateError") {
      return { success: false, error: "This device is already registered. Try unlocking instead." };
    }
    return { success: false, error: err?.message ?? "Biometric setup failed." };
  }
}

export async function authenticateBiometric(credentialId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  if (!isBiometricSupported()) {
    return { success: false, error: "Biometric authentication is not supported." };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rawId = b64decode(credentialId);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: rawId as unknown as ArrayBuffer }],
        userVerification: "required",
        timeout: 60000,
      },
    });

    if (!assertion) return { success: false, error: "Authentication cancelled." };
    return { success: true };
  } catch (err: any) {
    if (err?.name === "NotAllowedError") {
      return { success: false, error: "Biometric verification denied or timed out." };
    }
    if (err?.name === "SecurityError") {
      return { success: false, error: "Security error. Make sure you're on HTTPS or localhost." };
    }
    return { success: false, error: err?.message ?? "Authentication failed." };
  }
}
