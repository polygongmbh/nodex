import React from "react";
import LinkifyIt from "linkify-it";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { Person } from "@/types";
import { getMentionAliases, normalizeMentionIdentifier } from "@/lib/mentions";

const TOKEN_REGEX =
  /(^|[^A-Za-z0-9_])(#([A-Za-z0-9_]+)|@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?))/g;
const linkify = new LinkifyIt();

function formatPubkeyMention(pubkey: string): string {
  return pubkey.length === 64 ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : pubkey;
}

function resolveMentionPerson(identifier: string, people: Person[] | undefined): Person | null {
  if (!people || people.length === 0) return null;
  const normalizedIdentifier = normalizeMentionIdentifier(identifier);
  if (!normalizedIdentifier) return null;

  for (const person of people) {
    const aliases = getMentionAliases(person);
    if (aliases.includes(normalizedIdentifier)) {
      return person;
    }
  }

  return null;
}

interface LinkifyOptions {
  plainHashtags?: boolean;
  people?: Person[];
  onMentionClick?: (person: Person) => void;
}

export function linkifyContent(
  content: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const matches = linkify.match(content) || [];
  const parts: Array<{ kind: "text" | "url"; value: string; href?: string }> = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ kind: "url", value: match.text, href: match.url });
    lastIndex = match.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ kind: "text", value: content.slice(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ kind: "text", value: content });
  }

  return parts.flatMap((part, index) => {
    if (part.kind === "url" && part.href) {
      return [(
        <a
          key={index}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`${TASK_INTERACTION_STYLES.inlineLink} break-all`}
        >
          {part.value}
        </a>
      )];
    }

    const nodes: React.ReactNode[] = [];
    let tokenCursor = 0;
    TOKEN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_REGEX.exec(part.value)) !== null) {
      const matchIndex = match.index;
      const prefix = match[1] ?? "";
      const token = match[2] ?? "";
      const hashtag = match[3];
      const mention = match[4];
      const tokenStart = matchIndex + prefix.length;

      if (tokenStart > tokenCursor) {
        nodes.push(part.value.slice(tokenCursor, tokenStart));
      }

      if (token.startsWith("#") && hashtag) {
        nodes.push(
          <button
            key={`${index}-${tokenStart}-${token}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onHashtagClick?.(hashtag);
            }}
            className={options?.plainHashtags ? "" : TASK_INTERACTION_STYLES.inlineLink}
            data-onboarding="content-hashtag"
            aria-label={`Filter by #${hashtag}`}
            title={`Filter to #${hashtag}`}
          >
            #{hashtag}
          </button>
        );
      } else if (token.startsWith("@") && mention) {
        const mentionIdentifier = normalizeMentionIdentifier(mention);
        const resolvedPerson = resolveMentionPerson(mentionIdentifier, options?.people);
        const mentionLabel = resolvedPerson?.name
          || resolvedPerson?.displayName
          || formatPubkeyMention(mentionIdentifier);

        if (resolvedPerson && options?.onMentionClick) {
          nodes.push(
            <button
              key={`${index}-${tokenStart}-${token}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                options.onMentionClick?.(resolvedPerson);
              }}
              className={TASK_INTERACTION_STYLES.inlineLink}
              aria-label={`Open user ${mentionLabel}`}
              title={token}
            >
              @{mentionLabel}
            </button>
          );
        } else {
          nodes.push(
            <span
              key={`${index}-${tokenStart}-${token}`}
              className={TASK_INTERACTION_STYLES.inlineLink}
              title={token}
            >
              @{mentionLabel}
            </span>
          );
        }
      } else {
        nodes.push(part.value.slice(tokenStart, tokenStart + token.length));
      }

      tokenCursor = tokenStart + token.length;
    }

    if (tokenCursor < part.value.length) {
      nodes.push(part.value.slice(tokenCursor));
    }

    return nodes.length > 0 ? nodes : [part.value];
  });
}
