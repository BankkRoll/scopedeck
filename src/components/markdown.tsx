import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { openOnHackerOne } from "@/lib/open-external";

// SECURITY: content comes from other people (reports, policies, hacktivity). The default
// GitHub schema already drops scripts, event handlers and javascript: URLs; images are also
// removed because the CSP forbids remote loads and a tracking pixel would otherwise leak IPs.
const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => tag !== "img" && tag !== "picture" && tag !== "source",
  ),
  protocols: { ...defaultSchema.protocols, href: ["https", "mailto"] },
};

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) void openOnHackerOne(href);
      }}
      title={href}
    >
      {children}
    </a>
  ),
};

interface MarkdownProps {
  source: string;
  className?: string;
}

export const Markdown = memo(function Markdown({ source, className }: MarkdownProps) {
  return (
    <div className={cn("prose-report", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
