declare module "qrcode" {
  interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  }
  function toDataURL(text: string, opts?: QRCodeToDataURLOptions): Promise<string>;
  function toString(text: string, opts?: { type?: string }): Promise<string>;
  export = { toDataURL, toString };
}
