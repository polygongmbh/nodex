import React from "react";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { Person } from "@/types";
import { getMentionAliases, normalizeMentionIdentifier } from "@/lib/mentions";

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const TOKEN_REGEX =
  /(^|[^A-Za-z0-9_])(#([A-Za-z0-9_]+)|@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?))/g;

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
  const parts = content.split(URL_REGEX);
  
  return parts.flatMap((part, index) => {
    URL_REGEX.lastIndex = 0;
    if (URL_REGEX.test(part)) {
      return [(
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`${TASK_INTERACTION_STYLES.inlineLink} break-all`}
        >
          {part}
        </a>
      )];
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    TOKEN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_REGEX.exec(part)) !== null) {
      const matchIndex = match.index;
      const prefix = match[1] ?? "";
      const token = match[2] ?? "";
      const hashtag = match[3];
      const mention = match[4];
      const tokenStart = matchIndex + prefix.length;

      if (tokenStart > lastIndex) {
        nodes.push(part.slice(lastIndex, tokenStart));
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
              title={`Open user ${mentionLabel}`}
            >
              @{mentionLabel}
            </button>
          );
        } else {
          nodes.push(
            <span key={`${index}-${tokenStart}-${token}`} className={TASK_INTERACTION_STYLES.inlineLink}>
              @{mentionLabel}
            </span>
          );
        }
      } else {
        nodes.push(part.slice(tokenStart, tokenStart + token.length));
      }

      lastIndex = tokenStart + token.length;
    }

    if (lastIndex < part.length) {
      nodes.push(part.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : [part];
  });
}
