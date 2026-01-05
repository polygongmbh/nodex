import React from "react";

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

export function linkifyContent(content: string): React.ReactNode[] {
  const parts = content.split(URL_REGEX);
  
  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex after test
      URL_REGEX.lastIndex = 0;
      return (
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
      );
    }
    return part;
  });
}
