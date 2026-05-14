import { useEffect } from "react";

const BASE_URL = "https://orahdex.replit.app";
const DEFAULT_IMAGE = `${BASE_URL}/opengraph.jpg`;
const SITE_NAME = "OrahDEX";

interface SEOOptions {
  title: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  jsonLd?: object | object[];
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id: string, data: object | object[]) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function useSEO({
  title,
  description,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  jsonLd,
}: SEOOptions) {
  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`;
    const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

    document.title = fullTitle;

    if (description) setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
    setMeta("robots", "index, follow, max-snippet:-1, max-image-preview:large");

    setLink("canonical", fullUrl);

    setMeta("og:type", type, "property");
    setMeta("og:title", fullTitle, "property");
    if (description) setMeta("og:description", description, "property");
    setMeta("og:url", fullUrl, "property");
    setMeta("og:image", image, "property");
    setMeta("og:image:alt", title, "property");
    setMeta("og:site_name", SITE_NAME, "property");

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    if (description) setMeta("twitter:description", description);
    setMeta("twitter:image", image);
    setMeta("twitter:image:alt", title);

    if (jsonLd) {
      setJsonLd("page-jsonld", jsonLd);
    }

    return () => {
      document.title = `${SITE_NAME} — Trade means DEX`;
    };
  }, [title, description, keywords, image, url, type, jsonLd]);
}
