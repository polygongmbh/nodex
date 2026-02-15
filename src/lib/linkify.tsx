import React from "react";

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const HASHTAG_REGEX = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_]+)/g;

export function linkifyContent(
  content: string,
  onHashtagClick?: (tag: string) => void
): React.ReactNode[] {
  const parts = content.split(URL_REGEX);
  
  return parts.flatMap((part, index) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex after test
      URL_REGEX.lastIndex = 0;
      return [(
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline break-all"
        >
          {part}
        </a>
      )];
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    HASHTAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = HASHTAG_REGEX.exec(part)) !== null) {
      const matchIndex = match.index;
      const prefix = match[1] ?? "";
      const tag = match[2] ?? "";
      const hashtagStart = matchIndex + prefix.length;

      if (hashtagStart > lastIndex) {
        nodes.push(part.slice(lastIndex, hashtagStart));
      }

      nodes.push(
        <button
          key={`${index}-${hashtagStart}-${tag}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHashtagClick?.(tag);
          }}
          className="text-primary hover:underline"
          data-onboarding="content-hashtag"
          aria-label={`Filter by #${tag}`}
          title={`Filter to #${tag}`}
        >
          #{tag}
        </button>
      );

      lastIndex = hashtagStart + tag.length + 1;
    }

    if (lastIndex < part.length) {
      nodes.push(part.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : [part];
  });
}
