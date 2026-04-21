type Crumb = {
  name: string;
  path: string;
};

const BASE_URL = "https://mileclear.com";

export default function BreadcrumbsJsonLd({ crumbs }: { crumbs: Crumb[] }) {
  const items = [{ name: "Home", path: "/" }, ...crumbs];
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path === "/" ? BASE_URL : `${BASE_URL}${c.path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
